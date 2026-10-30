(function (root) {
  'use strict';
  const D = root.EscapeStarSeaData || require('./game-data.js');
  const E = root.EscapeStarSeaEngine || require('./game-core.js');
  const ids = ['player_1', 'player_2'], slots = ['plunder', 'trade', 'mobility'];
  const cards = new Map([...D.regularCards, ...D.opportunityCards].map(c => [c.id, c]));
  const nodes = new Map(D.universes.flatMap(u => u.nodes.map(n => [n.id, u.index])));
  const phases = ['roll','choose','warp','response','decision','personal','game_over'];
  const rootKeys = 'version seed mode skipMode privacyMode round rollerIndex phase dice choices movementPlans warpQueue warpIndex warpContext personalOrder personalIndex mustDiscard response decision sharedFlow immediateQueue nextImmediateId afterImmediate placements drawChoiceQueue drawChoiceContinuation passingQueue passingContinuation nextEventId log regularDeck regularDiscard opportunityDeck opportunityDiscard players duel duelResult aiMode aiHistory'.split(' ');
  const fail = (at, why = '字段不合法') => { throw new Error(`存档校验失败：${at}（${why}）。当前对局未更改。`); };
  function obj(v, at) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(at,'需要对象'); return v; }
  function integer(v, at, min = 0, max = 1000000) { if (!Number.isSafeInteger(v) || v < min || v > max) fail(at,'整数超出范围'); return v; }
  function bool(v, at) { if (typeof v !== 'boolean') fail(at,'需要真假值'); return v; }
  function en(v, allowed, at) { if (!allowed.includes(v)) fail(at,'不在允许范围'); return v; }
  function arr(v, at, max = 200) { if (!Array.isArray(v) || v.length > max) fail(at,'数组过长或缺失'); return v; }
  function unique(v, at) { if (new Set(v).size !== v.length) fail(at,'重复项目'); return v; }
  function pid(v, at) { return en(v, ids, at); }
  function cid(v, at, nullable = false) { if (nullable && v === null) return null; if (!cards.has(v)) fail(at,'未知卡牌'); return v; }
  function nid(v, at, stage) { if (!nodes.has(v) || (stage !== undefined && nodes.get(v) !== stage)) fail(at,'地图节点与宇宙不符'); return v; }
  function text(v, at, max = 1000) { if (typeof v !== 'string' || v.length > 10000) fail(at,'文本缺失或过长'); return v.replace(/[<>\u0000-\u001f\u007f]/g,'').slice(0,max); }
  function token(v, at) { if (typeof v !== 'string' || v.length > 120 || !/^[A-Za-z0-9_:|.-]+$/.test(v)) fail(at,'标识符不合法'); return v; }
  function select(v, keys, at) { obj(v,at); const out={}; for(const key of keys) if(Object.hasOwn(v,key)) out[key]=v[key]; return out; }
  // Clone only JSON data, rejecting prototypes, executable values, recursion and
  // excessive depth before a single imported value reaches a DOM-facing field.
  function jsonCopy(v, at='root', depth=0, seen=new Set(), budget={count:0}) {
    if (++budget.count > 50000 || depth > 25) fail(at,'存档过大或嵌套过深');
    if (v===null || typeof v==='boolean' || typeof v==='string') return v;
    if (typeof v==='number') { if(!Number.isFinite(v)) fail(at,'非有限数字'); return v; }
    if (typeof v!=='object') fail(at,'只接受 JSON 数据');
    if (seen.has(v)) fail(at,'循环引用'); seen.add(v);
    if (!Array.isArray(v) && ![Object.prototype,null].includes(Object.getPrototypeOf(v))) fail(at,'对象原型不合法');
    const out=Array.isArray(v)?[]:{};
    for(const key of Object.keys(v)) {
      if(['__proto__','constructor','prototype'].includes(key)) fail(at,'禁止原型字段');
      const desc=Object.getOwnPropertyDescriptor(v,key); if(!desc || !('value' in desc)) fail(at,'禁止存取器');
      out[key]=jsonCopy(desc.value,`${at}.${key}`,depth+1,seen,budget);
    }
    seen.delete(v); return out;
  }
  function cardList(v,at,kind) { return arr(v,at,144).map(x=>{cid(x,at);if(kind&&!D[`${kind}Cards`].some(c=>c.id===x))fail(at,'牌堆类型不符');return x;}); }
  function playerIds(v,at,max=2) { return unique(arr(v,at,max).map(x=>pid(x,at)),at); }
  function player(v,index) {
    const at=`players.${index}`, p=select(v,'id name color stage position energy power warp hand equipment routePreference activeThisRound skipSchedule recoverySchedule exhausted escaped withdrawn escapedRound fortressProtected'.split(' '),at);
    en(p.id,[ids[index]],`${at}.id`); p.name=text(p.name,`${at}.name`,16) || (index?'星海领航员':'你');
    p.color=['#78d6ff','#ffb45e'][index]; integer(p.stage,`${at}.stage`,1,3);
    for(const k of ['activeThisRound','exhausted','escaped','withdrawn','fortressProtected']) bool(p[k],`${at}.${k}`);
    if(p.escaped) { if(p.position!==null)fail(`${at}.position`,'已离场玩家位置必须为空'); }
    else nid(p.position,`${at}.position`,p.stage);
    integer(p.energy,`${at}.energy`,0,10); integer(p.power,`${at}.power`,0,1000000); integer(p.warp,`${at}.warp`,0,100000);
    en(p.routePreference,['normal'],`${at}.routePreference`); p.hand=cardList(p.hand,`${at}.hand`);
    if(p.hand.some(id=>cards.get(id).type==='immediate'))fail(`${at}.hand`,'立即牌不可存入手牌');
    obj(p.equipment,`${at}.equipment`); p.equipment=Object.fromEntries(slots.map(slot=>{
      const id=cid(p.equipment[slot],`${at}.equipment.${slot}`,true);
      if(id&&(cards.get(id).type!=='equipment'||cards.get(id).slot!==slot))fail(`${at}.equipment.${slot}`,'装备槽不匹配'); return [slot,id];
    }));
    p.skipSchedule=arr(p.skipSchedule,`${at}.skipSchedule`,1000).map(x=>({round:integer(x.round,at,1),source:text(x.source,at,80)}));
    p.recoverySchedule=arr(p.recoverySchedule,`${at}.recoverySchedule`,1000).map(x=>({round:integer(x.round,at,1),energy:integer(x.energy,at,0,10)}));
    if(p.escapedRound!==null)integer(p.escapedRound,`${at}.escapedRound`,1);
    if(p.withdrawn&&!p.escaped)fail(at,'退出玩家必须离场');
    if(p.escaped&&(p.hand.length||slots.some(k=>p.equipment[k])||p.energy||p.power||p.warp))fail(at,'已离场玩家残留资源');
    return p;
  }
  function choice(v,at) {
    const c=select(v,['key','label','value','baseKey','navBonus'],at); token(c.key,at); if(!/^(die_[01]|sum)(_n[01])?$/.test(c.key))fail(at,'掷骰选项不合法');
    c.label=text(c.label,at,100); integer(c.value,at,1,12);
    if(c.baseKey!==undefined)en(c.baseKey,['die_0','die_1','sum'],at); if(c.navBonus!==undefined)integer(c.navBonus,at,0,1); return c;
  }
  function context(v,at) {
    const c=select(v,['bright','dark','double','reversed','broken','protected'],at);
    for(const k of ['bright','dark','double'])if(c[k]!==undefined)integer(c[k],`${at}.${k}`,0,16);
    for(const k of ['reversed','broken','protected'])if(c[k]!==undefined)bool(c[k],`${at}.${k}`); return c;
  }
  function params(v,at,card) {
    const p=select(v,['targetId','nodeId','slot','steps','navBonus','routePreference','equipmentCardId'],at);
    if(p.targetId!==undefined)pid(p.targetId,at); if(p.nodeId!==undefined)nid(p.nodeId,at); if(p.slot!==undefined)en(p.slot,slots,at);
    if(p.steps!==undefined)integer(p.steps,at,1,card?.maxSteps||6); if(p.navBonus!==undefined)integer(p.navBonus,at,0,1);
    if(p.routePreference!==undefined)en(p.routePreference,['normal'],at); if(p.equipmentCardId!==undefined)cid(p.equipmentCardId,at);
    if(card?.requiresTarget&&!p.targetId)fail(at,'目标缺失'); if(['moveSelf','moveOther'].includes(card?.action)&&p.steps===undefined)fail(at,'步数缺失'); return p;
  }
  function action(v,at) {
    const a=select(v,'kind actorId playerId cardId action stage nodeId flowKind suppressBaseDraw trigger completionCardId context params alreadyDiscarded cancelled cancelReason equipmentCardId triggerKind name transformed'.split(' '),at);
    en(a.kind,['map','equipment_trigger','immediate','equipment','annihilate_equipment','plunder','trade','card'],at); pid(a.actorId,at);
    if(a.playerId!==undefined)pid(a.playerId,at); if(a.cardId!==undefined)cid(a.cardId,at,true);
    const c=cards.get(a.cardId); if(!['map','equipment_trigger'].includes(a.kind)&&!c)fail(at,'行动卡牌缺失');
    if(a.action!==undefined&&a.action!==c?.action)fail(at,'行动与卡牌不符');
    if(a.context!==undefined)a.context=context(a.context,at); else a.context={};
    if(a.params!==undefined)a.params=params(a.params,at,c); else if(c)a.params=params({},at,c);
    for(const k of ['suppressBaseDraw','alreadyDiscarded','cancelled','transformed'])if(a[k]!==undefined)bool(a[k],at);
    if(a.cancelReason!==undefined)en(a.cancelReason,['withdrawn'],at);
    if(a.flowKind!==undefined)en(a.flowKind,['shared','personal','immediate'],at);
    if(a.trigger!==undefined)en(a.trigger,['landing','transition','directed_jump','teleport','wormhole_probe','wormhole_exit'],at);
    if(a.completionCardId!==undefined)cid(a.completionCardId,at,true);
    if(a.kind==='map'||a.kind==='equipment_trigger'){ integer(a.stage,at,1,3);nid(a.nodeId,at,a.stage);pid(a.playerId,at); }
    if(a.kind==='equipment_trigger'){cid(a.equipmentCardId,at);en(a.equipmentCardId,['dyson_sphere','space_probe'],at);en(a.triggerKind,['dyson','probe'],at);}
    if(a.name!==undefined)a.name=text(a.name,at,120);
    if(a.kind==='immediate'&&c.type!=='immediate')fail(at,'立即牌类型不符');
    if(a.kind==='equipment'&&c.type!=='equipment')fail(at,'装备类型不符');
    if(['card','immediate'].includes(a.kind)&&a.action!==c.action)fail(at,'行动类型缺失');
    if(a.kind==='annihilate_equipment'&&(c.action!=='annihilate'||!a.params.targetId||!a.params.slot))fail(at,'装备湮灭目标缺失');
    if(a.action==='unequip_any'&&(!a.params.targetId||!a.params.slot||!a.params.equipmentCardId||cards.get(a.params.equipmentCardId).slot!==a.params.slot))fail(at,'卸甲原目标装备缺失');
    if(a.kind==='plunder'&&c.action!=='plunder'&&!(c.action==='trade'&&a.transformed))fail(at,'掠夺卡牌类型不符');
    if(a.kind==='trade'&&c.action!=='trade')fail(at,'交易卡牌类型不符');
    if(a.kind==='map'&&(!a.flowKind||a.suppressBaseDraw===undefined))fail(at,'地图结算上下文缺失');
    return a;
  }
  function trigger(v,at) { const t=select(v,['playerId','stage','nodeId','equipmentCardId','triggerKind'],at);pid(t.playerId,at);integer(t.stage,at,1,3);nid(t.nodeId,at,t.stage);en(t.equipmentCardId,['dyson_sphere','space_probe'],at);en(t.triggerKind,['dyson','probe'],at);return t; }
  function plan(v,at) {
    const p=select(v,'playerId from stage steps path final warpIndex transition stationId flowKind passingTriggers suppressBaseDraw trigger sourceCardId afterMapAction'.split(' '),at);
    pid(p.playerId,at);integer(p.stage,at,1,3);nid(p.from,at,p.stage);integer(p.steps,at,0,12);p.path=arr(p.path,at,12).map(x=>nid(x,at,p.stage));
    bool(p.transition,at);integer(p.warpIndex,at,-1,11);en(p.flowKind,['shared','personal','immediate'],at);
    if(p.transition){if(p.stage>=3)fail(at,'末阶不可升级');nid(p.stationId,at,p.stage+1);if(!E.universe(p.stage+1).stationIds.includes(p.stationId))fail(at,'升级目标不是驿站');en(p.final,[p.stationId],at);}
    else {nid(p.final,at,p.stage);if(p.stationId!==null)fail(at,'未升级不应有目标驿站');}
    if(p.steps===0){if(p.path.length!==1||p.path[0]!==p.from)fail(at,'落点购买路径不符');}
    else {if(p.path.length!==p.steps)fail(at,'步数与路径不符');let current=p.from;for(const id of p.path){if(!E.nodeById(p.stage,current).next.includes(id))fail(at,'普通路径不连续');current=id;}}
    if(!p.transition&&p.final!==p.path[p.path.length-1])fail(at,'终点与路径不符');
    if(p.warpIndex!==p.path.findIndex(id=>E.nodeById(p.stage,id).kind==='warp'))fail(at,'跃迁点路径索引不符');
    if(p.passingTriggers!==undefined)p.passingTriggers=arr(p.passingTriggers,at,12).map(t=>trigger(t,at));
    if(p.suppressBaseDraw!==undefined)bool(p.suppressBaseDraw,at);if(p.sourceCardId!==undefined)cid(p.sourceCardId,at,true);
    if(p.trigger!==undefined)en(p.trigger,['landing','transition','directed_jump','teleport','wormhole_probe','wormhole_exit'],at);
    if(p.afterMapAction!==undefined)p.afterMapAction=action(p.afterMapAction,at);return p;
  }
  function entries(v,at) {const out=arr(v,at,144).map(x=>({key:token(x.key,at),cardId:cid(x.cardId,at)}));unique(out.map(x=>x.key),at);return out;}
  function immediate(v,at) {const x={playerId:pid(v.playerId,at),cardId:cid(v.cardId,at),token:token(v.token,at),orderLocked:bool(v.orderLocked,at)};if(cards.get(x.cardId).type!=='immediate')fail(at,'非立即牌');return x;}
  function radar(v,at,isDecision=false) {
    const x=select(v,['kind','playerId','count','entries','equipmentName','drawKind','stage','picked','returnOrder'],at);pid(x.playerId,at);integer(x.count,at,1,144);x.entries=entries(x.entries,at);if(x.count>x.entries.length)fail(at,'选牌数超过可选牌');x.equipmentName=text(x.equipmentName,at,80);
    en(isDecision?x.drawKind:x.kind,['regular','opportunity'],at);
    if(isDecision){en(x.stage,['pick','order'],at);x.picked=unique(arr(x.picked,at,144).map(k=>en(k,x.entries.map(e=>e.key),at)),at);x.returnOrder=unique(arr(x.returnOrder,at,144).map(k=>en(k,x.entries.map(e=>e.key),at)),at);if(x.picked.some(k=>x.returnOrder.includes(k))||x.picked.length>x.count)fail(at,'雷达选牌重叠');}
    return x;
  }
  function decision(v,at,state) {
    obj(v,at);const kind=en(v.kind,['radar_choice','immediate_order','immediate_unequip','teleport','controlled_movement','discard_equipment_required','discard_hand_reward','discard_equipment_reward','wormhole_probe'],at);
    if(kind==='radar_choice')return radar(v,at,true);
    const d=select(v,'kind playerId controllerId cardId completionCardId items ordered targets nodeIds steps allowedNav routes slots cards reward action nodeId'.split(' '),at);pid(d.playerId,at);const p=state.players.find(p=>p.id===d.playerId);
    if(d.cardId!==undefined)cid(d.cardId,at);if(d.completionCardId!==undefined)cid(d.completionCardId,at,true);if(d.action!==undefined)d.action=action(d.action,at);
    if(d.nodeId!==undefined)nid(d.nodeId,at,p.stage);
    if(kind==='immediate_order'){d.items=arr(d.items,at,16).map(i=>{const x={token:token(i.token,at),cardId:cid(i.cardId,at)};if(cards.get(x.cardId).type!=='immediate')fail(at,'非立即牌');return x;});unique(d.items.map(x=>x.token),at);d.ordered=unique(arr(d.ordered,at,16).map(x=>en(x,d.items.map(i=>i.token),at)),at);}
    if(kind==='immediate_unequip'){en(d.cardId,['immediate_unequip'],at);d.targets=arr(d.targets,at,6).map(t=>{pid(t.playerId,at);en(t.slot,slots,at);cid(t.cardId,at);if(t.key!==`${t.playerId}|${t.slot}`||cards.get(t.cardId).slot!==t.slot)fail(at,'卸甲目标不合法');return {key:t.key,playerId:t.playerId,slot:t.slot,cardId:t.cardId};});if(!d.targets.length)fail(at,'无卸甲目标应自动结算');}
    if(kind==='teleport'){d.nodeIds=unique(arr(d.nodeIds,at,50).map(id=>nid(id,at,p.stage)),at);if(!d.nodeIds.length||!d.completionCardId)fail(at,'传送目标或来源缺失');}
    if(kind==='controlled_movement'){pid(d.controllerId,at);integer(d.steps,at,1,2);d.allowedNav=unique(arr(d.allowedNav,at,2).map(n=>integer(n,at,0,1)),at);d.routes=arr(d.routes,at,1).map(x=>en(x,['normal'],at));if(!d.allowedNav.length||!d.routes.length||!d.completionCardId)fail(at,'受控移动选项缺失');}
    if(kind.startsWith('discard_')||kind==='wormhole_probe'){if(!d.action||!d.nodeId)fail(at,'地图选择来源缺失');}
    if(kind==='discard_equipment_required'||kind==='discard_equipment_reward'){d.slots=unique(arr(d.slots,at,3).map(s=>en(s,slots,at)),at);if(!d.slots.length||d.slots.some(s=>!p.equipment[s]))fail(at,'待弃装备不存在');}
    if(kind==='discard_hand_reward'){d.cards=cardList(d.cards,at);if(d.cards.some(id=>!p.hand.includes(id)))fail(at,'待弃手牌不存在');}
    if(kind==='discard_hand_reward'||kind==='discard_equipment_reward'){const n=E.nodeById(p.stage,d.nodeId),reward=n.discardHandReward||n.discardEquipmentReward;if(!reward||JSON.stringify(d.reward)!==JSON.stringify(reward))fail(at,'回收奖励与地图不符');d.reward={...reward};}
    return d;
  }
  function response(v,at) {
    const r=select(v,['root','stack','order','cursor','passes'],at);r.root=action(r.root,`${at}.root`);r.order=playerIds(r.order,at);if(!r.order.length)fail(at,'响应玩家为空');integer(r.cursor,at,0,r.order.length-1);integer(r.passes,at,0,r.order.length);
    r.stack=arr(r.stack,at,145).map((v,i)=>{const x=select(v,['playerId','cardId','name','action','targetIndex','annihilationTarget','cancelled'],at);pid(x.playerId,at);cid(x.cardId,at,i===0);x.name=text(x.name,at,120);bool(x.cancelled,at);
      if(i>0){const c=cards.get(x.cardId);if(c.type!=='instant'||x.action!==c.action)fail(at,'响应牌类型不符');}
      if(x.targetIndex!==undefined&&x.targetIndex!==null)integer(x.targetIndex,at,0,i-1);
      if(x.annihilationTarget){const t=select(x.annihilationTarget,['type','index','playerId','slot','cardId'],at);en(t.type,['stack','equipment'],at);if(t.type==='stack')integer(t.index,at,0,i-1);else{pid(t.playerId,at);en(t.slot,slots,at);cid(t.cardId,at);if(cards.get(t.cardId).slot!==t.slot)fail(at,'响应装备槽不符');}x.annihilationTarget=t;}
      return x;});
    if(!r.stack.length||r.stack[0].cardId!==(r.root.cardId||null)||r.stack[0].playerId!==r.root.actorId)fail(at,'响应原事件不一致');return r;
  }
  function conservation(s) {
    const owned=[...s.regularDeck,...s.regularDiscard,...s.opportunityDeck,...s.opportunityDiscard];
    s.players.forEach(p=>owned.push(...p.hand,...Object.values(p.equipment).filter(Boolean)));
    owned.push(...s.immediateQueue.map(x=>x.cardId));s.drawChoiceQueue.forEach(q=>owned.push(...q.entries.map(x=>x.cardId)));
    if(s.response)s.response.stack.forEach((x,i)=>{if(x.cardId&&!(i===0&&s.response.root.alreadyDiscarded))owned.push(x.cardId);});
    if(s.decision?.kind==='immediate_unequip')owned.push(s.decision.cardId);
    const completion=s.response?.root?.completionCardId||s.decision?.completionCardId||s.decision?.action?.completionCardId||s.passingContinuation?.plan?.sourceCardId||s.warpQueue[s.warpIndex]?.plan?.sourceCardId;
    if(completion)owned.push(completion);
    const counts=new Map();owned.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
    for(const c of cards.values())if(counts.get(c.id)!==c.copies)fail('cards',`卡牌份数不守恒：${c.name}`);
  }
  function validateAndNormalize(input) {
    const raw=jsonCopy(input),s=select(raw,rootKeys,'root'); E.validateSaveVersion(s);en(s.duel,[true],'duel');
    s.players=arr(s.players,'players',2).map(player);if(s.players.length!==2)fail('players','需要两位玩家');
    en(s.mode,['experience','quick','immersive'],'mode');en(s.skipMode,['loose','strict'],'skipMode');en(s.phase,phases,'phase');
    integer(s.seed,'seed',0,4294967295);integer(s.round,'round',1);integer(s.rollerIndex,'rollerIndex',0,1);integer(s.nextEventId,'nextEventId',1,100000000);integer(s.nextImmediateId,'nextImmediateId',1,100000000);
    s.privacyMode=false;s.aiMode='local';bool(s.mustDiscard,'mustDiscard');
    s.dice=arr(s.dice,'dice',2).map(n=>integer(n,'dice',1,6));if(s.dice.length!==0&&s.dice.length!==2)fail('dice');
    for(const k of ['regular','opportunity'])for(const suffix of ['Deck','Discard'])s[k+suffix]=cardList(s[k+suffix],k+suffix,k);
    obj(s.choices,'choices');s.choices=Object.fromEntries(Object.entries(s.choices).map(([id,c])=>[pid(id,'choices'),choice(c,'choices')]));
    obj(s.movementPlans,'movementPlans');s.movementPlans=Object.fromEntries(Object.entries(s.movementPlans).map(([id,p])=>{pid(id,'movementPlans');const parsed=plan(p,'movementPlans');if(parsed.playerId!==id)fail('movementPlans','玩家不一致');return [id,parsed];}));
    s.warpQueue=arr(s.warpQueue,'warpQueue',2).map(v=>{const x=select(v,['playerId','plan','cost','max','stationIds'],'warpQueue');pid(x.playerId,'warpQueue');x.plan=plan(x.plan,'warpQueue.plan');if(x.plan.playerId!==x.playerId)fail('warpQueue');en(x.cost,[25,30],'warpQueue.cost');integer(x.max,'warpQueue.max',0,1000000);x.stationIds=arr(x.stationIds,'warpQueue.stationIds',4).map(id=>nid(id,'warpQueue.stationIds'));const allowed=x.plan.stage<3?E.universe(x.plan.stage+1).stationIds:[];if(JSON.stringify(x.stationIds)!==JSON.stringify(allowed))fail('warpQueue.stationIds','升级驿站列表不符');return x;});
    integer(s.warpIndex,'warpIndex',0,s.warpQueue.length);en(s.warpContext,[null,'shared','single','landing'],'warpContext');
    s.personalOrder=playerIds(s.personalOrder,'personalOrder');integer(s.personalIndex,'personalIndex',0,s.personalOrder.length);
    s.response=s.response===null?null:response(s.response,'response');s.decision=s.decision===null?null:decision(s.decision,'decision',s);
    s.immediateQueue=arr(s.immediateQueue,'immediateQueue',16).map(v=>immediate(v,'immediateQueue'));unique(s.immediateQueue.map(x=>x.token),'immediateQueue');
    s.drawChoiceQueue=arr(s.drawChoiceQueue,'drawChoiceQueue',16).map(v=>radar(v,'drawChoiceQueue'));
    s.passingQueue=arr(s.passingQueue,'passingQueue',24).map(v=>trigger(v,'passingQueue'));
    en(s.afterImmediate,[null,'enterPersonal','immediate','personal'],'afterImmediate');
    if(s.drawChoiceContinuation!==null){const c=select(s.drawChoiceContinuation,['kind','afterImmediate'],'drawChoiceContinuation');en(c.kind,['after_passing_trigger','after_unified_draw','after_map_draw','after_immediate_draw','after_personal_opportunity'],'drawChoiceContinuation');if(c.afterImmediate!==undefined)en(c.afterImmediate,[null,'personal'],'drawChoiceContinuation');s.drawChoiceContinuation=c;}
    if(s.passingContinuation!==null){const c=select(s.passingContinuation,['kind','completedContext','plan'],'passingContinuation');en(c.kind,['shared_plans_ready','single_plan_ready','warp_decision_ready'],'passingContinuation');if(c.completedContext!==undefined)en(c.completedContext,['shared','single','landing'],'passingContinuation');if(c.plan!==undefined)c.plan=plan(c.plan,'passingContinuation.plan');if(c.kind!=='shared_plans_ready'&&!c.plan)fail('passingContinuation','移动计划缺失');s.passingContinuation=c;}
    if(s.sharedFlow!==null){const f=select(s.sharedFlow,['queue','index','pendingDraws'],'sharedFlow');f.queue=playerIds(f.queue,'sharedFlow');integer(f.index,'sharedFlow.index',0,f.queue.length);obj(f.pendingDraws,'sharedFlow.pendingDraws');f.pendingDraws=Object.fromEntries(Object.entries(f.pendingDraws).map(([id,x])=>[pid(id,'pendingDraws'),{regular:integer(x.regular,'pendingDraws',0,144),opportunity:integer(x.opportunity,'pendingDraws',0,16)}]));s.sharedFlow=f;}
    s.placements=arr(s.placements,'placements',2).map(x=>({rank:integer(x.rank,'placements',1,2),round:integer(x.round,'placements',1,s.round),playerIds:playerIds(x.playerIds,'placements')}));
    if(s.duelResult!==undefined&&s.duelResult!==null){const r=s.duelResult;s.duelResult={winnerIds:playerIds(r.winnerIds,'duelResult'),round:integer(r.round,'duelResult',1,s.round),reason:en(r.reason,['concede','escape'],'duelResult')};}
    s.log=arr(s.log,'log',180).map(x=>{const l={id:integer(x.id,'log.id',1,100000000),round:integer(x.round,'log.round',1,s.round),message:text(x.message,'log.message',2000),tone:en(x.tone,['neutral','positive','negative','accent'],'log.tone')};if(x.privateTo!==undefined)l.privateTo=pid(x.privateTo,'log.privateTo');if(x.publicMessage!==undefined)l.publicMessage=text(x.publicMessage,'log.publicMessage',2000);return l;});
    s.aiHistory=arr(s.aiHistory||[],'aiHistory',500).map(x=>({round:integer(x.round,'aiHistory',1,s.round),caption:text(x.caption,'aiHistory',250),reason:text(x.reason,'aiHistory',1000),source:'local'}));
    if(s.phase==='response'&&!s.response)fail('response','响应阶段缺失响应链');
    if(s.phase==='decision'&&!s.decision)fail('decision','选择阶段缺失选择');
    if(s.phase!=='game_over'&&((s.response&&s.phase!=='response')||(s.decision&&s.phase!=='decision')))fail('phase','阶段与待处理状态不一致');
    if(s.phase==='warp'&&(!s.warpQueue[s.warpIndex]||!s.warpContext))fail('warpQueue','购买阶段缺失购买计划');
    if(s.phase==='personal'&&!s.players.find(p=>p.id===s.personalOrder[s.personalIndex]&&!p.escaped))fail('personalOrder','个人回合缺失有效行动者');
    if(s.phase==='choose'&&s.dice.length!==2)fail('dice','选点阶段必须有两枚骰子');
    if(s.decision?.kind==='radar_choice'){
      const d=s.decision,q=s.drawChoiceQueue[0];
      if(!q||q.playerId!==d.playerId||q.kind!==d.drawKind||q.count!==d.count||JSON.stringify(q.entries)!==JSON.stringify(d.entries))fail('decision','雷达可选牌与待处理队列不一致');
    }
    if(s.decision?.kind==='immediate_order'){
      const d=s.decision,q=s.immediateQueue.filter(x=>x.playerId===d.playerId&&!x.orderLocked).map(x=>({token:x.token,cardId:x.cardId}));
      if(q.length<2||JSON.stringify(q)!==JSON.stringify(d.items))fail('decision','立即牌排序与待处理队列不一致');
    }
    if(s.decision?.kind==='immediate_unequip'){
      const legal=E.immediateUnequipTargets(s,s.decision.playerId);
      if(JSON.stringify(legal)!==JSON.stringify(s.decision.targets))fail('decision','立即卸甲目标与当前装备不一致');
    }
    conservation(s);return s;
  }
  const api={validateAndNormalize};root.StarSeaSaveValidation=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
