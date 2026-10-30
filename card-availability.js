(function(root){
  'use strict';
  const E=root.EscapeStarSeaEngine||(typeof require==='function'?require('./game-core.js'):null);
  const equipped=(p,id)=>Object.values(p.equipment).includes(id);
  const fail=reason=>({allowed:false,reason});
  function noTargetReason(s,c,p){
    const others=s.players.filter(q=>q.id!==p.id&&!q.escaped);
    const converted=c.action==='trade'&&equipped(p,'force_take');
    if(c.action==='plunder'||converted){
      const prefix=converted?'【强取豪夺】已将此牌改为超距掠夺Ⅱ；':'';
      if(equipped(p,'reclusive'))return prefix+'你装备了【隐世】，暂时不能掠夺。';
      const range=converted?'higher':c.range;
      if(range==='same'&&!others.some(q=>q.stage===p.stage&&q.position===p.position))return prefix+'没有同格对手；与对手到达同一格后才能使用。';
      if(range==='higher'&&!others.some(q=>q.stage>p.stage))return prefix+'没有位于更高宇宙的对手；暂时保留此牌。';
      const targets=others.filter(q=>range==='same'?q.stage===p.stage&&q.position===p.position:range==='higher'?q.stage>p.stage:true);
      if(targets.length&&targets.every(q=>E.isFortressProtected(q)))return prefix+'对手受星际堡垒保护，现在不能选择它。';
      if(targets.length&&targets.every(q=>equipped(q,'reclusive')))return prefix+'对手装备了【隐世】，现在不能被掠夺。';
    }
    if(c.action==='trade'&&!converted){
      if(equipped(p,'delisted'))return '你装备了【退市】，暂时不能交易。';
      let payPower=c.payPower||0,payEnergy=c.payEnergy||0;
      if(c.gainEnergy&&equipped(p,'energy_discount')){payPower=5;payEnergy=0;}
      if(c.gainPower&&equipped(p,'power_discount')){payPower=0;payEnergy=5;}
      if(p.power<payPower)return `交易需${payPower}动力，你有${p.power}；还差${payPower-p.power}动力。`;
      if(p.energy<payEnergy)return `交易需${payEnergy}能源，你有${p.energy}；还差${payEnergy-p.energy}能源。`;
      if(others.length&&others.every(q=>E.isFortressProtected(q)))return '对手受星际堡垒保护，现在不能选择它交易。';
      if(others.length&&others.every(q=>equipped(q,'delisted')))return '对手装备了【退市】，现在不能与它交易。';
      return '没有满足条件的交易对象；对方需有足够资源且未受保护。';
    }
    return '当前没有满足牌面条件的目标；可先保留此牌。';
  }
  function availability(s,id,humanId='player_1'){
    const p=s.players.find(p=>p.id===humanId),c=E.cardById(id);
    if(!p||!c)return fail('无法读取这张牌。');
    if(s.phase==='game_over')return fail('本局已结束 · 可查看卡牌');
    if(p.escaped)return fail('你已逃离，本局不再出牌。');
    if(s.phase==='response'){
      if(E.currentResponder(s)?.id!==humanId)return fail('正在等待对手响应；轮到你时才能操作。');
      if(E.availableResponses(s).includes(id))return {allowed:true,response:true,reason:'当前可响应 · 点击在牌上操作'};
      if(c.type!=='instant')return fail('现在是响应窗口；行动牌和装备须等你的个人回合。');
      if(c.action==='annihilate')return fail('当前没有可湮灭的待结算牌或装备。');
      const windowName={map_bright:'地图格结算',map_dark:'地图格结算',plunder_double:'掠夺',plunder_reverse:'掠夺',trade_break:'交易',trade_protect:'交易'}[c.action];
      return fail(windowName?`此牌仅用于${windowName}响应；本次不适用。`:'此牌不适用于本次响应。');
    }
    if(s.phase!=='personal')return fail(({roll:'先掷骰并完成移动；个人回合再出行动牌。',choose:'先选骰面并锁定移动；个人回合再出行动牌。',moving:'正在结算移动；完成后再进入个人回合。',warp:'先完成跃迁购买；手牌暂时不能主动使用。',decision:'先完成操作区中的当前选择，再使用手牌。'})[s.phase]||'当前正在结算；请先完成操作区中的步骤。');
    if(E.currentPersonalPlayer(s)?.id!==humanId)return fail('现在是对手的个人回合；轮到你时才能主动出牌。');
    if(s.mustDiscard)return {allowed:false,discard:true,reason:'正在整理手牌 · 点击将弃置此牌'};
    if(c.type==='immediate')return fail('立即牌由获得时的流程处理，不能在这里主动打出。');
    if(c.type==='instant'&&c.action!=='annihilate')return fail('此瞬发牌留到对应响应窗口使用，不能在个人回合主动打出。');
    if(c.requiresTarget&&!E.validTargets(s,id,humanId).length)return fail(noTargetReason(s,c,p));
    if(c.action==='annihilate'){
      const hasTarget=s.players.some(q=>!(q.id!==humanId&&E.isFortressProtected(q))&&Object.values(q.equipment).some(Boolean));
      if(!hasTarget)return fail('当前没有可湮灭的装备；可保留到后续响应窗口。');
    }
    return {allowed:true,reason:c.type==='equipment'?'点击在牌上装备':'点击在牌上使用'};
  }
  root.StarSeaCardAvailability={availability};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.StarSeaCardAvailability;
})(typeof globalThis!=='undefined'?globalThis:this);
