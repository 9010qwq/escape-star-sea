(function bootstrapEscapeStarSea() {
  const Data = window.EscapeStarSeaData;
  const Engine = window.EscapeStarSeaEngine;
  const STORAGE_KEY = "escape-star-sea-duel-v0.5";
  const AUTO_STORAGE_KEY = "escape-star-sea-duel-v0.5-autosave";
  let state = null;
  let mapViewStage = 1;
  let selectedHand = null;
  const cardDrafts = new Map();
  let voyageStarted = false;
  let mapFocusKey = '';
  let toastTimer = null;
  let feedbackTimer = null;
  let privacyUnlockedKey = null;
  const AI = window.EscapeStarSeaAI;
  const HUMAN_ID = 'player_1', AI_ID = 'player_2';
  let aiTimer = null, aiBusy = false, revision = 0, requestAbort = null;
  let aiStatus = '本地策略已就绪', lastAiAction = '等待启航';
  let equipmentAnchor = null;
  const phoneLandscape = matchMedia('(max-width:1120px) and (min-aspect-ratio:3/2)');
  const compactScreen = matchMedia('(max-width:1120px)');
  let mapZoom = false;
  function syncPhoneLayout() {
    const wasCompact=document.body.classList.contains('compact-ui');
    document.body.classList.toggle('compact-ui',compactScreen.matches);
    document.body.classList.toggle('phone-landscape',phoneLandscape.matches);
    if(compactScreen.matches&&!wasCompact)setHandFolded(true);
    $('#handBackdrop').hidden=!compactScreen.matches||document.body.classList.contains('hand-folded');
    if(state){renderMap();requestAnimationFrame(focusMapOnPlayer);}
  }

  function setHandFolded(folded) {
    if(folded) selectedHand=null;
    const wasFolded=document.body.classList.contains('hand-folded');
    document.body.classList.toggle('hand-folded',folded);
    if(wasFolded&&!folded){document.body.classList.add('hand-reveal');setTimeout(()=>document.body.classList.remove('hand-reveal'),450);}
    $('#toggleHandButton').textContent=folded?'展开手牌 ↑':'收起手牌 ↓';
    $('#toggleHandButton').setAttribute('aria-expanded',String(!folded));
    $('#handBackdrop').hidden=!compactScreen.matches||folded;
    if(folded && state) renderHand();
  }
  
  function hideHoverDetail() { $('#hoverDetail').hidden=true; }
  
  function showHoverDetail(target) {
    if(document.querySelector('dialog[open]')||!$('#equipmentPopover').hidden)return;
    const box=$('#hoverDetail');
    box.innerHTML='<strong>'+escapeHtml(target.dataset.hoverTitle)+'</strong><p>'+escapeHtml(target.dataset.hoverText)+'</p>';
    box.hidden=false;
    const r=target.getBoundingClientRect(),tip=box.getBoundingClientRect();
    box.style.left=Math.max(10,Math.min(innerWidth-tip.width-10,r.left+(r.width-tip.width)/2))+'px';
    const y=r.bottom+10+tip.height<innerHeight?r.bottom+10:r.top-tip.height-10;
    box.style.top=Math.max(10,y)+'px';
  }
  
  function bindHoverDetails(container) {
    container.querySelectorAll('[data-hover-title]').forEach(n=>{
      n.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')showHoverDetail(n);});
      n.addEventListener('pointerleave',hideHoverDetail);
      n.addEventListener('focus',()=>showHoverDetail(n));n.addEventListener('blur',hideHoverDetail);
    });
  }
  
  function equipmentSummary(c) {
    const summaries={dyson_sphere:'经过恒星有收益',space_probe:'经过眼区有收益',supernav:'前进可加1或2格',double_trade:'交易收益翻倍',self_loop:'可与自己交易',dispersed_array:'免短距与爆破',delisted:'停交易，地图增益',hermit:'停掠夺，地图增益'};
    return summaries[c.id]||c.description;
  }
  
  function nodeEffect(n) {
    const sign=v=>v>0?'+'+v:String(v).replace('-','−');
    const parts=[];
    if(n.energy)parts.push('能'+sign(n.energy));if(n.power)parts.push('动'+sign(n.power));
    if(n.kind==='unknown')return '机遇1 · 常规1';
    if(n.kind==='warp')return '购买曲速 · 可多点';
    if(n.kind==='eye')return '能+2 动+20 · 逃离';
    if(n.fortress)return '5–6动+30；停留保护';
    if(n.chaos)return '另掷骰 · 资源变化';
    if(n.discardEquipmentReward)return '弃装备：能+6 动+40';
    if(n.discardHandReward)return '弃手牌：能+2 动+10';
    if(n.kind==='tunnel')return '奇：能+1传送；偶：能−2动+30';
    if(n.kind==='wormhole')return n.oneWayEye?'经眼区 → 左上':n.pair?'停留 → 对侧虫洞':'单向虫洞出口';
    if(n.pair)return '停留 → 对侧虫洞';
    if(n.forcedBack)parts.push('退'+n.forcedBack+' · 不摸牌');
    if(n.forcedForward)parts.push('进'+n.forcedForward+' · 不摸牌');
    if(n.stagnation)parts.push('停'+n.stagnation+'轮');
    if(n.discardEquipment)parts.push('弃装备');
    if(n.extraRegular)parts.push('额外常规'+n.extraRegular);
    if(n.extraOpportunity)parts.push('额外机遇'+n.extraOpportunity);
    return parts.join(' · ')||'查看星域详情';
  }
  
  function cardEmblem(c) {
    const strokes={annihilate:'<circle cx="24" cy="24" r="14"/><path d="M8 40L40 8M19 9L25 17L20 24L27 30L24 40"/>',equip:'<path d="M24 5L40 14V33L24 43L8 33V14Z"/><path d="M24 13V35M14 19L34 29M34 19L14 29"/>',plunder:'<path d="M7 32L35 8L29 28L15 42L19 29Z"/><path d="M31 33L41 40M36 27L45 28"/>',trade:'<path d="M7 17H38L31 10M41 31H10L17 38"/><circle cx="24" cy="24" r="4"/>',moveSelf:'<path d="M7 34L20 11L25 24L40 18L27 41L23 28Z"/>',moveOther:'<path d="M7 34L20 11L25 24L40 18L27 41L23 28Z"/>',map_bright:'<circle cx="24" cy="24" r="10"/><path d="M24 2V9M24 39V46M2 24H9M39 24H46M8 8L13 13M35 35L40 40M8 40L13 35M35 13L40 8"/>',map_dark:'<path d="M34 7A18 18 0 1 0 41 33A18 18 0 0 1 34 7Z"/>'};
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">'+(strokes[c.action]||'<circle cx="24" cy="24" r="14"/><ellipse cx="24" cy="24" rx="22" ry="7" transform="rotate(-35 24 24)"/><path d="M24 15V33M15 24H33"/>')+'</svg>';
  }
  

  function closeEquipmentPopover(restoreFocus=false) {
    const anchor=equipmentAnchor;
    $('#equipmentPopover').hidden=true;
    anchor?.setAttribute('aria-expanded','false');
    equipmentAnchor=null;
    if(restoreFocus&&anchor?.isConnected)anchor.focus({preventScroll:true});
  }

  function positionEquipmentPopover() {
    const box=$('#equipmentPopover');
    if(box.hidden||!equipmentAnchor?.isConnected)return;
    const anchor=equipmentAnchor.getBoundingClientRect();
    const height=window.visualViewport?.height||innerHeight;
    const width=window.visualViewport?.width||innerWidth;
    box.style.maxHeight=Math.max(120,height-24)+'px';
    const r=box.getBoundingClientRect();
    box.style.left=Math.max(12,Math.min(width-r.width-12,anchor.left+anchor.width/2-r.width/2))+'px';
    const below=anchor.bottom+8;
    box.style.top=Math.max(12,Math.min(height-r.height-12,below+r.height<height-12?below:anchor.top-r.height-8))+'px';
  }

  function openEquipment(playerId, selectedSlot, anchor) {
    hideHoverDetail();
    if(equipmentAnchor===anchor&&!$('#equipmentPopover').hidden){closeEquipmentPopover();return;}
    closeEquipmentPopover();
    const p=playerById(playerId), canUse=p.id===HUMAN_ID && state.phase==='personal' && Engine.currentPersonalPlayer(state)?.id===HUMAN_ID && !state.mustDiscard;
    const slots={mobility:'机动',trade:'交易',plunder:'掠夺'};
    const id=p.equipment[selectedSlot],c=id&&Engine.cardById(id),box=$('#equipmentPopover');
    const candidates=canUse?p.hand.map((id,index)=>({card:Engine.cardById(id),index})).filter(x=>x.card.type==='equipment'&&x.card.slot===selectedSlot):[];
    box.innerHTML=`<div class="equipment-popover-heading"><div><small>${escapeHtml(p.name)} · ${slots[selectedSlot]}槽</small><h3 id="equipmentPopoverTitle">${c?escapeHtml(c.name):'未装备'}</h3></div><button class="ghost-button" type="button" data-close-equipment aria-label="关闭装备操作">×</button></div><p>${c?escapeHtml(c.description):'此槽可保留一件'+slots[selectedSlot]+'装备。'}</p>${id&&canUse?'<button class="secondary-button full" type="button" data-unequip-slot="'+selectedSlot+'">卸下这件装备</button>':''}${candidates.length?'<div class="equipment-candidates"><small>'+ (c?'从手牌选择替换装备':'从手牌选择装备') +'</small>'+candidates.map(x=>'<button class="ghost-button full" type="button" data-equip-hand="'+x.index+'">'+escapeHtml(x.card.name)+' →</button>').join('')+'</div>':!canUse?'<small>装备持续效果自动生效。自己的个人回合可换装或卸装。</small>':'<small>装备后持续效果自动生效。</small>'}`;
    equipmentAnchor=anchor;anchor.setAttribute('aria-expanded','true');box.hidden=false;
    positionEquipmentPopover();
    box.querySelector('[data-close-equipment]').addEventListener('click',()=>closeEquipmentPopover(true));
    box.querySelector('[data-unequip-slot]')?.addEventListener('click',()=>safeAction(()=>Engine.unequipEquipment(state,selectedSlot)));
    box.querySelectorAll('[data-equip-hand]').forEach(b=>b.addEventListener('click',()=>{const index=Number(b.dataset.equipHand);closeEquipmentPopover();setHandFolded(false);selectedHand=null;inspectHand(index);}));
    box.querySelector('button')?.focus({preventScroll:true});
  }

  function inspectHand(index) {
    if(document.body.classList.contains('hand-folded'))setHandFolded(false);
    const p=playerById(HUMAN_ID),id=p.hand[index];if(!id)return;
    if(state.phase==='personal'&&Engine.currentPersonalPlayer(state)?.id===HUMAN_ID){
      if(state.mustDiscard){safeAction(()=>Engine.discardCard(state,id),true);return;}
      selectedHand=selectedHand===index?null:index;renderHand();renderPersonalControls();revealSelectedCard();return;
    }
    selectedHand=selectedHand===index?null:index;renderHand();
    revealSelectedCard();
  }

  function revealSelectedCard() {
    if(selectedHand===null)return;
    requestAnimationFrame(()=>{
      const card=els.hand.querySelector('.game-card.selected'),panel=card?.querySelector('.card-inline-actions');
      const availableHeight=compactScreen.matches?els.hand.clientHeight:innerHeight-28;
      const target=card&&card.getBoundingClientRect().height<availableHeight?card:phoneLandscape.matches?panel?.querySelector('.primary-button'):panel;
      target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
  }

  function renderNodeDetail(stage,id) {
    const n=Engine.nodeById(stage,id);
    $('#nodeDetail').innerHTML='<strong>'+escapeHtml(n.name)+'</strong><span>'+escapeHtml(n.description)+'</span>';
    hideHoverDetail();
    $('#nodeDialogTitle').textContent=n.name;
    $('#nodeDialogText').textContent=n.description;
    $('#nodeDialog').showModal();
  }

  function setMobileView(view) {
    document.body.dataset.mobileView = view;
    document.querySelectorAll('[data-mobile-view]').forEach(button=>button.classList.toggle('active',button.dataset.mobileView===view));
    if(view==='map')requestAnimationFrame(focusMapOnPlayer);
  }

  function focusMapOnPlayer() {
    const viewport=$('.map-viewport');if(!state||!viewport.clientWidth)return;
    positionMapTokens();
    const p=state.players.find(p=>p.id===HUMAN_ID&&p.stage===mapViewStage)||state.players.find(p=>p.stage===mapViewStage);
    const node=p&&[...els.mapStage.querySelectorAll('[data-node-id]')].find(n=>n.dataset.nodeId===p.position);
    const token=p&&els.mapStage.querySelector('[data-token-player="'+p.id+'"]');
    const base=viewport.getBoundingClientRect();
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left-base.left+viewport.scrollLeft,top:r.top-base.top+viewport.scrollTop,right:r.right-base.left+viewport.scrollLeft,bottom:r.bottom-base.top+viewport.scrollTop};};
    const boxes=[node,token].filter(Boolean).map(rect);
    const x=boxes.length?(Math.min(...boxes.map(r=>r.left))+Math.max(...boxes.map(r=>r.right)))/2:els.mapStage.clientWidth/2;
    const y=boxes.length?(Math.min(...boxes.map(r=>r.top))+Math.max(...boxes.map(r=>r.bottom)))/2:els.mapStage.clientHeight/2;
    let left=x-viewport.clientWidth/2,top=y-viewport.clientHeight/2;
    if(token){const r=rect(token);left=Math.max(r.right-viewport.clientWidth+8,Math.min(left,r.left-8));top=Math.max(r.bottom-viewport.clientHeight+8,Math.min(top,r.top-8));}
    viewport.scrollTo({left:Math.max(0,left),top:Math.max(0,top),behavior:'instant'});
  }

  function cancelAi() {
    revision++;
    clearTimeout(aiTimer); aiTimer = null;
    if (requestAbort) requestAbort.abort();
    requestAbort = null; aiBusy = false;
  }
  function aiToAct() {
    return state && !state.duelResult && AI.getActor(state) === AI_ID;
  }
  function actionCaption(action) {
    const map = { choose:'已锁定移动路线', movement:'已锁定移动路线', roll:'已掷出公共骰', pass:'暂不响应', respond:'完成瞬发响应', response:'完成瞬发响应', warp:'完成跃迁决定', decision:'完成效果选择', discard:'整理手牌', end:'结束个人回合', endTurn:'结束个人回合', play:'打出卡牌', card:'打出卡牌', unequip:'调整装备' };
    return map[action.type] || '完成一次行动';
  }
  function renderAiPanel() {
    $('#aiStatus').textContent = aiBusy ? '对手正在考虑…' : aiStatus;
    $('#lastAiAction').textContent = lastAiAction;

    $('#opponentActivity').textContent = aiBusy ? '对手思考中' : aiToAct() ? '对手行动中' : state?.duelResult ? '本局结束' : '等待你的行动';
    $('#opponentActivity').classList.toggle('thinking', aiBusy || Boolean(aiToAct()));
    const review = $('#aiReview');
    review.hidden = !state?.duelResult;
    if (state?.duelResult) $('#aiReviewList').innerHTML = (state.aiHistory || []).slice(-60).reverse().map(h => '<li>R' + h.round + ' · ' + escapeHtml(h.caption) + '：' + escapeHtml(h.reason) + '</li>').join('');
  }

  function checkApi() {
    if(state)state.aiMode='local';
    aiStatus='本地策略 · 权衡资源与出牌时机';
    renderAiPanel();
  }
  function scheduleAi() {
    clearTimeout(aiTimer);
    if (aiBusy || !aiToAct() || document.querySelector('dialog[open]')) return;
    aiTimer = setTimeout(runAi, 420);
  }
  async function runAi() {
    if (aiBusy || !aiToAct() || document.querySelector('dialog[open]')) return;
    const token = revision;
    aiBusy = true; renderAiPanel();
    try {
      const observation = AI.buildObservation(state, AI_ID);
      const candidates = AI.rankActions(observation);
      if (!candidates.length) throw new Error('当前没有合法 AI 行动');
      let action = candidates[0], source = 'local';
      if (token !== revision || !aiToAct()) return;
      aiBusy = false; requestAbort = null;
      aiStatus = '本地策略 · 权衡资源与出牌时机';
      lastAiAction = actionCaption(action);
      safeAction(() => {
        AI.applyAction(state, action);
        state.aiHistory = state.aiHistory || [];
        state.aiHistory.push({round:observation.round || state.round,caption:lastAiAction,reason:action.reason || '综合比较合法行动',source});
        if (state.aiHistory.length > 500) state.aiHistory.shift();
      });
    } catch (error) {
      aiBusy = false;
      aiStatus = 'AI 暂停：' + error.message;
      console.error(error);
      renderAiPanel();
    } finally {
      if (token === revision) { aiBusy = false; requestAbort = null; }
    }
  }

  const $ = (selector) => document.querySelector(selector);
  const els = {
    phaseRail: $("#phaseRail"),
    mapStage: $("#mapStage"),
    mapTitle: $("#mapTitle"),
    mapTabs: $("#mapTabs"),
    roundValue: $("#roundValue"),
    rollerValue: $("#rollerValue"),
    modeValue: $("#modeValue"),
    phaseNumber: $("#phaseNumber"),
    phaseTitle: $("#phaseTitle"),
    phaseHelp: $("#phaseHelp"),
    phaseControls: $("#phaseControls"),
    playerList: $("#playerList"),
    deckCount: $("#deckCount"),
    rankingList: $("#rankingList"),
    handTitle: $("#handTitle"),
    handCount: $("#handCount"),
    hand: $("#hand"),
    turnActions: $("#turnActions"),
    eventLog: $("#eventLog"),
    setupDialog: $("#setupDialog"),
    setupForm: $("#setupForm"),
    playerCount: $("#playerCount"),
    gameMode: $("#gameMode"),
    skipMode: $("#skipMode"),
    privacyMode: $("#privacyMode"),
    seedInput: $("#seedInput"),
    participantSetup: $("#participantSetup"),
    restoreAutoButton: $("#restoreAutoButton"),
    cancelSetupButton: $("#cancelSetupButton"),
    rulesDialog: $("#rulesDialog"),
    rulesButton: $("#rulesButton"),
    closeRulesButton: $("#closeRulesButton"),
    prototypeRulings: $("#prototypeRulings"),
    saveButton: $("#saveButton"),
    loadButton: $("#loadButton"),
    exportButton: $("#exportButton"),
    importButton: $("#importButton"),
    importInput: $("#importInput"),
    newButton: $("#newButton"),
    toast: $("#toast"),
    feedbackLayer: $("#feedbackLayer"),
  };

  const phaseCopy = {
    roll: ["01", "公开掷骰", "由本轮掷骰玩家投掷两枚公开六面骰。"],
    choose: ["02", "双方选点", "点击骰面即锁定本轮选择，双方可选相同点数；第三宇宙分岔请先选好。"],
    warp: ["03", "跃迁购买", "路径已同步锁定，依次处理经过跃迁点的购买与跨阶选择。"],
    response: ["04", "瞬发响应", "双方依次获得响应机会；连续一圈无人响应后，从最后一张开始逆序结算。"],
    decision: ["05", "效果选择", "当前规则效果需要指定目标、弃牌或选择移动方式。"],
    personal: ["06", "个人回合", "当前玩家可连续打出任意数量的合法普通牌或装备，然后主动结束回合。"],
    game_over: ["07", "游戏结束", "所有仍在局内的玩家都已逃离星海。"],
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[char]));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function playFeedback(event, phaseChanged = false) {
    if (!event && !phaseChanged) return;
    const tone = event?.tone || "accent";
    document.body.classList.remove("feedback-positive", "feedback-negative", "feedback-accent");
    void document.body.offsetWidth;
    document.body.classList.add(`feedback-${["positive", "negative"].includes(tone) ? tone : "accent"}`);
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      document.body.classList.remove("feedback-positive", "feedback-negative", "feedback-accent");
    }, 520);
    if (!els.feedbackLayer || !["positive", "negative", "accent"].includes(tone)) return;
    els.feedbackLayer.innerHTML = Array.from({ length: tone === "positive" ? 12 : 7 }, (_, index) => {
      const angle = (360 / (tone === "positive" ? 12 : 7)) * index;
      const distance = 38 + (index % 3) * 14;
      return `<i style="--angle:${angle}deg;--distance:${distance}px;--delay:${index * 12}ms"></i>`;
    }).join("");
    els.feedbackLayer.className = `feedback-layer show ${tone}`;
    setTimeout(() => { els.feedbackLayer.className = "feedback-layer"; }, 620);
  }

  function safeAction(action, closeHandAfter = false) {
    const beforeHandoff = handoffKey();
    const beforePhase = state?.phase;
    const beforeEventId = state?.log?.[0]?.id || 0;
    try {
      cancelAi();
      hideHoverDetail();
      closeEquipmentPopover();
      action();
      selectedHand = null;
      window.EscapeStarSeaDuel.settle(state);
      if (beforePhase !== state.phase && ['response','decision','warp','personal','game_over'].includes(state.phase)) setMobileView('action');
      const afterHandoff = handoffKey();
      if (beforeHandoff !== afterHandoff) privacyUnlockedKey = null;
      followActiveStage();
      persistAutosave();
      render();
      if(closeHandAfter&&compactScreen.matches&&!state.mustDiscard)setHandFolded(true);
      const latestEvent = state?.log?.[0];
      playFeedback(latestEvent && latestEvent.id !== beforeEventId ? latestEvent : null, beforePhase !== state?.phase);
    } catch (error) {
      console.error(error);
      showToast(error.message || "操作失败");
    }
  }

  function persistAutosave() {
    if (!state) return;
    try {
      localStorage.setItem(AUTO_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("自动存档失败", error);
    }
  }

  function normalizeRestoredState(restored) {
    if (!restored || restored.version !== Data.version) throw new Error("存档版本不兼容");
    if (!restored.duel || restored.players?.length !== 2 || restored.players[0].id !== HUMAN_ID || restored.players[1].id !== AI_ID) throw new Error('请导入本版本的一对一存档');
    restored.privacyMode = false;
    restored.aiMode = 'local';
    restored.drawChoiceQueue = restored.drawChoiceQueue || [];
    restored.drawChoiceContinuation = restored.drawChoiceContinuation || null;
    restored.passingQueue = restored.passingQueue || [];
    restored.passingContinuation = restored.passingContinuation || null;
    restored.nextImmediateId = Number(restored.nextImmediateId || 1);
    restored.immediateQueue = (restored.immediateQueue || []).map((item, index) => ({
      ...item,
      token: item.token || `restored_immediate_${index + 1}`,
      orderLocked: Boolean(item.orderLocked),
    }));
    restored.players.forEach((player) => {
      player.skipSchedule = player.skipSchedule || [];
      player.recoverySchedule = player.recoverySchedule || [];
      player.withdrawn = Boolean(player.withdrawn);
      if (typeof player.fortressProtected !== "boolean") {
        player.fortressProtected = Boolean(!player.escaped && Engine.nodeById(player.stage, player.position)?.fortress);
      }
    });
    return restored;
  }

  function restoreFromStorage(key, label) {
    const saved = localStorage.getItem(key);
    if (!saved) throw new Error(`当前浏览器没有${label}`);
    const restored = normalizeRestoredState(JSON.parse(saved));
    cancelAi();
    state = restored; cardDrafts.clear();
    voyageStarted = true;
    selectedHand = null;
    privacyUnlockedKey = null;
    followActiveStage();
    persistAutosave();
    render();
  }

  function updateRestoreButton() {
    els.cancelSetupButton.hidden = !voyageStarted;
    try {
      const saved = localStorage.getItem(AUTO_STORAGE_KEY);
      if (!saved) {
        els.restoreAutoButton.textContent = "暂无自动存档";
        els.restoreAutoButton.disabled = true;
        return;
      }
      const summary = JSON.parse(saved);
      els.restoreAutoButton.textContent = `继续第${summary.round || 1}轮 · ${phaseCopy[summary.phase]?.[1] || "规则结算"}`;
      els.restoreAutoButton.disabled = false;
    } catch (error) {
      els.restoreAutoButton.textContent = "自动存档不可用";
      els.restoreAutoButton.disabled = true;
    }
  }

  function playerById(id) {
    return state.players.find((player) => player.id === id);
  }

  function currentFocusPlayer() {
    if (state.phase === "response") return Engine.currentResponder(state);
    if (state.phase === "decision" && state.decision) return playerById(state.decision.playerId);
    if (state.phase === "warp") {
      const offer = Engine.currentWarpOffer(state);
      return offer ? playerById(offer.playerId) : null;
    }
    return Engine.currentPersonalPlayer(state);
  }

  function handoffKey() {
    if (!state || !state.privacyMode) return null;
    if (state.phase === "response" && state.response) {
      const responder = Engine.currentResponder(state);
      return responder ? `R${state.round}:response:${state.response.stack.length}:${state.response.cursor}:${responder.id}` : null;
    }
    if (state.phase === "decision" && state.decision) {
      return `R${state.round}:decision:${state.decision.kind}:${state.decision.playerId}:${state.decision.nodeId || "none"}`;
    }
    if (state.phase === "personal") {
      const player = Engine.currentPersonalPlayer(state);
      return player ? `R${state.round}:personal:${state.personalIndex}:${player.id}` : null;
    }
    return null;
  }

  function isHandoffLocked() {
    const key = handoffKey();
    return Boolean(key && privacyUnlockedKey !== key);
  }

  function renderHandoffCurtain() {
    const player = currentFocusPlayer();
    const label = state.phase === "response" ? "响应机会" : state.phase === "decision" ? "专属效果选择" : "个人回合";
    els.phaseControls.innerHTML = `<div class="handoff-curtain">
      <span class="handoff-icon">◉</span>
      <p>请把设备交给 <strong style="color:${player.color}">${escapeHtml(player.name)}</strong></p>
      <small>${label}可能涉及私密手牌。其他玩家请暂时移开视线。</small>
      <button class="primary-button full" id="unlockHandoff" type="button">我就是${escapeHtml(player.name)} · 查看并继续</button>
    </div>`;
    $("#unlockHandoff").addEventListener("click", () => {
      privacyUnlockedKey = handoffKey();
      render();
    });
  }

  function followActiveStage() {
    const focus = currentFocusPlayer();
    const human = playerById(HUMAN_ID);
    if (human && !human.escaped) mapViewStage = human.stage;
  }

  function renderPhaseRail() {
    els.phaseRail.innerHTML = Data.phases.map(([key, label], index) => {
      const active = state.phase === key || (state.phase === "game_over" && key === "end");
      return `<div class="phase-chip ${active ? "active" : ""}" data-phase="${key}">${String(index + 1).padStart(2, "0")} · ${escapeHtml(label)}</div>`;
    }).join("");
  }

  function nodePositions(stageNumber) {
    const currentUniverse = Engine.universe(stageNumber);
    const result = {};
    if(compactScreen.matches){
      const landscape=phoneLandscape.matches,cols=landscape?6:4,rows=landscape?4:6;
      let cells=[];
      if(stageNumber===3){
        const scheme=landscape?[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[5,1],[5,3],[0,3],[1,3],[2,3],[3,3],[0,2],[0,1],[1,1],[2,1],[3,2],[4,2]]:[[0,0],[1,0],[2,0],[3,0],[3,1],[3,2],[3,3],[3,5],[0,4],[1,5],[2,5],[2,4],[0,3],[0,2],[0,1],[1,2],[1,3],[2,3]];
        cells=scheme;
      }else{
        for(let x=0;x<cols;x++)cells.push([x,0]);for(let y=1;y<rows;y++)cells.push([cols-1,y]);for(let x=cols-2;x>=0;x--)cells.push([x,rows-1]);for(let y=rows-2;y>0;y--)cells.push([0,y]);
      }
      currentUniverse.nodes.forEach((node,i)=>{const [x,y]=cells[i];result[node.id]={x:(landscape?9:12)+x*(landscape?82:76)/(cols-1),y:(landscape?12:9)+y*(landscape?76:82)/(rows-1)};});
      els.mapStage.style.setProperty('--map-cols',cols);
      return result;
    }
    if (stageNumber === 3) {
      currentUniverse.nodes.forEach((node) => { result[node.id] = { x: Math.max(12, Math.min(88, node.x)), y: Math.max(9, Math.min(91, node.y)) }; });
      return result;
    }
    currentUniverse.nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / currentUniverse.nodes.length;
      result[node.id] = { x: 50 + Math.cos(angle) * 38, y: 50 + Math.sin(angle) * 36 };
    });
    return result;
  }

  function nodeClass(node) {
    if (node.kind.startsWith("wormhole")) return "wormhole";
    if (node.kind.startsWith("tunnel")) return "tunnel";
    return node.kind;
  }

  function renderMapTabs() {
    els.mapTabs.innerHTML = Data.universes.map((item) => {
      const count = state.players.filter((player) => !player.escaped && player.stage === item.index).length;
      return `<button class="map-tab ${mapViewStage === item.index ? "active" : ""}" data-map-stage="${item.index}" type="button">宇宙 ${item.index}</button>`;
    }).join("");
    els.mapTabs.querySelectorAll("[data-map-stage]").forEach((button) => {
      button.addEventListener("click", () => {
        mapViewStage = Number(button.dataset.mapStage);
        renderMap();
        requestAnimationFrame(focusMapOnPlayer);
      });
    });
  }

  function layoutMap() {
    const viewport=$('.map-viewport');
    if(compactScreen.matches){
      els.mapStage.classList.toggle('overview',!mapZoom);
      els.mapStage.style.width=(mapZoom?Math.max(900,viewport.clientWidth):viewport.clientWidth)+'px';
      els.mapStage.style.height=(mapZoom?Math.max(phoneLandscape.matches?500:680,viewport.clientHeight):viewport.clientHeight)+'px';
    }else{els.mapStage.classList.remove('overview');els.mapStage.style.width='';els.mapStage.style.height='';}
    $('#mapZoomButton').textContent=mapZoom?'全图':'放大';
    $('#mapZoomButton').setAttribute('aria-pressed',String(mapZoom));
    positionMapTokens();
  }

  function compactNodeEffect(n){
    if(n.kind==='warp')return '购买曲速';if(n.kind==='eye')return '资源 / 逃离';
    if(n.kind==='tunnel')return '判定 / 传送';if(n.kind==='wormhole')return n.oneWayEye?'经眼区传送':n.pair?'传至另一端':'单向出口';
    if(n.fortress)return '判定 / 保护';if(n.chaos)return '掷骰判定';
    if(n.discardEquipmentReward)return '弃装换资源';if(n.discardHandReward)return '弃牌换资源';
    if(n.forcedBack)return '退'+n.forcedBack+' / 不摸牌';if(n.forcedForward)return '进'+n.forcedForward+' / 不摸牌';
    if(n.stagnation)return '负面 / 停'+n.stagnation+'轮';if(n.discardEquipment)return '弃置装备';
    return nodeEffect(n).replaceAll('额外常规','摸常规').replaceAll('额外机遇','摸机遇').replaceAll(' · ',' ');
  }

  function renderMap() {
    const currentUniverse = Engine.universe(mapViewStage);
    const positions = nodePositions(mapViewStage);
    els.mapTitle.textContent = currentUniverse.name;
    renderMapTabs();

    const lines = [];
    currentUniverse.nodes.forEach((node) => {
      node.next.forEach((targetId) => {
        const a = positions[node.id];
        const b = positions[targetId];
        const special = node.kind.startsWith("wormhole") || node.kind.startsWith("tunnel") || node.next.length > 1;
        lines.push(`<polyline class="orbit-line ${special ? "special" : ""}" data-edge-from="${node.id}" data-edge-to="${targetId}" points="${a.x},${a.y} ${(a.x+b.x)/2},${(a.y+b.y)/2} ${b.x},${b.y}" fill="none" marker-mid="url(#arrow)" />`);
      });
    });
    if (mapViewStage === 3) {
      const a = positions.s3_tunnel_ur;
      const b = positions.s3_tunnel_ll;
      lines.push(`<line class="orbit-line special" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
    }

    const plannedNodes = new Set();
    const plannedEnds = new Set();
    if (state.phase === "choose") {
      state.players.filter((player) => !player.escaped && player.stage === mapViewStage && state.choices[player.id] && (player.id === HUMAN_ID || state.choices[HUMAN_ID] || !playerById(HUMAN_ID).activeThisRound)).forEach((player) => {
        const preview = Engine.previewMovement(state, player.id);
        preview.nodeIds.forEach((id) => plannedNodes.add(id));
        plannedEnds.add(preview.finalId);
      });
    }
    const nodes = currentUniverse.nodes.map((node) => {
      const pos = positions[node.id];
      return `<button type="button" data-node-id="${node.id}" class="map-node ${nodeClass(node)} ${plannedNodes.has(node.id) ? "planned" : ""} ${plannedEnds.has(node.id) ? "planned-end" : ""}" style="left:${pos.x}%;top:${pos.y}%" data-hover-title="${escapeHtml(node.name)}" data-hover-text="${escapeHtml(node.description)}" aria-label="${escapeHtml(node.name+'，'+node.description)}">
        <strong>${escapeHtml(node.short)}</strong><small class="node-effect">${escapeHtml(compactScreen.matches&&!mapZoom?compactNodeEffect(node):nodeEffect(node))}</small>
      </button>`;
    }).join("");

    const grouped = new Map();
    state.players.filter((player) => !player.escaped && player.stage === mapViewStage).forEach((player) => {
      if (!grouped.has(player.position)) grouped.set(player.position, []);
      grouped.get(player.position).push(player);
    });
    const tokens = [];
    grouped.forEach((players, nodeId) => {
      const pos = positions[nodeId];
      players.forEach((player, index) => {
        const offsetX = (index - (players.length - 1) / 2) * 35;
        tokens.push('<div class="player-token" data-token-node="'+nodeId+'" data-token-player="'+player.id+'" style="left:clamp(18px,calc('+pos.x+'% + '+offsetX+'px),calc(100% - 18px));top:clamp(18px,calc('+pos.y+'% + 23px),calc(100% - 18px));background:'+player.color+'" title="'+escapeHtml(player.name)+'" aria-label="'+escapeHtml(player.name)+'"><span>'+(player.id===HUMAN_ID?'你':'AI')+'</span></div>');
      });
    });

    els.mapStage.className = `map-stage stage-${mapViewStage}`;
    els.mapStage.innerHTML = `
      <svg class="orbit-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id="arrow" markerWidth="4" markerHeight="4" refX="3.3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="rgba(115,213,255,.62)"/></marker></defs>
        ${lines.join("")}
      </svg>
      <svg class="token-connectors" aria-hidden="true"></svg>
      <div class="node-layer">${nodes}</div><div class="token-layer">${tokens.join("")}</div>`;
    els.mapStage.querySelectorAll("[data-node-id]").forEach(b=>b.addEventListener("click",()=>renderNodeDetail(mapViewStage,b.dataset.nodeId)));
    bindHoverDetails(els.mapStage);
    requestAnimationFrame(layoutMap);
    const focusKey=mapViewStage+'|'+state.players.map(p=>p.stage+':'+p.position).join('|');
    if(focusKey!==mapFocusKey){mapFocusKey=focusKey;requestAnimationFrame(focusMapOnPlayer);}
  }

  function positionMapTokens() {
    const map=els.mapStage, bounds=map.getBoundingClientRect(), width=map.clientWidth, height=map.clientHeight;
    if(!width||!height)return;
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left-bounds.left-1,top:r.top-bounds.top-1,right:r.right-bounds.left-1,bottom:r.bottom-bounds.top-1};};
    const nodes=[...map.querySelectorAll('[data-node-id]')].map(n=>({...rect(n),id:n.dataset.nodeId}));
    const groups=new Map();
    map.querySelectorAll('[data-token-node]').forEach(t=>{const id=t.dataset.tokenNode;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(t);});
    if(compactScreen.matches&&!mapZoom){
      for(const [id,tokens] of groups){const anchor=nodes.find(n=>n.id===id);tokens.forEach((t,i)=>{const radius=t.offsetWidth/2;t.style.left=Math.max(radius+2,Math.min(width-radius-2,anchor.right-radius-2-i*(radius*2+2)))+'px';t.style.top=Math.max(radius+2,Math.min(height-radius-2,anchor.bottom+radius/2))+'px';});}
      map.querySelector('.token-connectors').innerHTML='';return;
    }
    const occupied=[...nodes], leaders=[];
    for(const [id,tokens] of groups){
      const anchor=nodes.find(n=>n.id===id), radius=tokens[0].offsetWidth/2, gap=radius*2+5;
      const ax=(anchor.left+anchor.right)/2,ay=(anchor.top+anchor.bottom)/2,half=(tokens.length-1)*gap/2;
      let best=null;
      for(let dy=-75;dy<=75;dy+=15)for(let dx=-90;dx<=90;dx+=15){
        const x=Math.max(radius+half+3,Math.min(width-radius-half-3,ax+dx));
        const y=Math.max(radius+3,Math.min(height-radius-3,ay+dy));
        const boxes=tokens.map((_,i)=>({left:x+(i-(tokens.length-1)/2)*gap-radius,top:y-radius,right:x+(i-(tokens.length-1)/2)*gap+radius,bottom:y+radius}));
        let overlap=0;for(const a of boxes)for(const q of occupied)overlap+=Math.max(0,Math.min(a.right+3,q.right)-Math.max(a.left-3,q.left))*Math.max(0,Math.min(a.bottom+3,q.bottom)-Math.max(a.top-3,q.top));
        const score=overlap*10000+Math.hypot(x-ax,y-ay)+Math.abs(dx)*.04+(dy<0?1:0);
        if(!best||score<best.score)best={x,y,boxes,score};
      }
      tokens.forEach((t,i)=>{t.style.left=(best.x+(i-(tokens.length-1)/2)*gap)+'px';t.style.top=best.y+'px';});
      occupied.push(...best.boxes);
      leaders.push('<line x1="'+ax+'" y1="'+ay+'" x2="'+best.x+'" y2="'+best.y+'"/>');
    }
    const svg=map.querySelector('.token-connectors');svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.innerHTML=leaders.join('');
  }

  function diceMarkup() {
    if (!state.dice.length) return "";
    return `<div class="dice-row"><div class="die">${state.dice[0]}</div><span class="dice-divider">+</span><div class="die">${state.dice[1]}</div></div>`;
  }

  function renderRoundMeta() {
    const roller = state.players[state.rollerIndex];
    const copy = phaseCopy[state.phase] || ["—", "规则结算", "正在继续当前结算。"];
    els.roundValue.textContent = state.round;
    els.rollerValue.textContent = roller.name;
    els.modeValue.textContent = ({experience:"体验局 · 1 / 1 / 2",quick:"快速局 · 1 / 2 / 3",immersive:"沉浸局 · 2 / 3 / 4"})[state.mode];
    els.phaseNumber.textContent = copy[0];
    els.phaseTitle.textContent = copy[1];
    els.phaseHelp.textContent = copy[2];
  }

  function renderRollControls() {
    const roller = state.players[state.rollerIndex];
    els.phaseControls.innerHTML = `<button class="primary-button full" id="rollButton" type="button">掷两枚骰子</button>`;
    $("#rollButton").addEventListener("click", () => safeAction(() => Engine.rollDice(state)));
  }

  function renderChoiceControls() {
    const html = state.players.map((player) => {
      if (player.escaped) return "";
      if (!player.activeThisRound) {
        return `<div class="choice-player"><div class="choice-player-head"><strong style="color:${player.color}">${escapeHtml(player.name)}</strong><span>本轮跳过</span></div></div>`;
      }
      if (player.id === AI_ID) {
        const selected = state.choices[AI_ID];
        const reveal = Boolean(state.choices[HUMAN_ID]) || !playerById(HUMAN_ID).activeThisRound;
        return '<div class="choice-player"><strong style="color:'+player.color+'">'+escapeHtml(player.name)+'</strong><p>'+ (selected ? (reveal ? '已选择 '+selected.value+' 格' : '已独立锁定路线，等你选择后公开') : '正在比较落点、资源和跃迁机会…') +'</p></div>';
      }
      const options = Engine.allowedChoices(state, player.id);
      const selected = state.choices[player.id];
      const preview = selected ? Engine.previewMovement(state, player.id) : null;
      const routeControls = player.stage === 3 ? `<div class="route-row"><span>左下分岔：</span>
        <button class="choice-button ${player.routePreference === "short" ? "selected" : ""}" data-route="short" data-player="${player.id}" type="button" ${selected ? "disabled" : ""}>短支路</button>
        <button class="choice-button ${player.routePreference === "long" ? "selected" : ""}" data-route="long" data-player="${player.id}" type="button" ${selected ? "disabled" : ""}>长支路</button></div>` : "";
      return `<div class="choice-player">
        <div class="choice-player-head"><strong style="color:${player.color}">${escapeHtml(player.name)}</strong><span>${selected ? `已锁定 ${selected.value}格` : "等待选择"}</span></div>
        <div class="choice-buttons">${options.map((option) => `<button class="choice-button ${selected && selected.key === option.key ? "selected" : ""}" data-choice="${option.key}" data-player="${player.id}" type="button" ${selected ? "disabled" : ""}>${escapeHtml(option.label)}<small>${escapeHtml(Engine.previewMovement(state, player.id, option.key).finalName)}</small></button>`).join("")}</div>
        ${routeControls}
        ${preview ? `<div class="route-preview"><strong>计划落点：${escapeHtml(preview.finalName)}</strong><span>${escapeHtml(preview.names.join(" → "))}${preview.warpIndex >= 0 ? " · 沿途经过跃迁点" : ""}</span></div>` : ""}
      </div>`;
    }).join("");
    els.phaseControls.innerHTML = `${diceMarkup()}<div class="choice-stack">${html}</div><button class="primary-button full" id="moveButton" type="button" ${Engine.allPlayersChosen(state) ? "" : "disabled"}>锁定全部路径并同步移动</button>`;
    els.phaseControls.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => safeAction(() => Engine.chooseMovement(state, button.dataset.player, button.dataset.choice)));
    });
    els.phaseControls.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => safeAction(() => Engine.setRoutePreference(state, button.dataset.player, button.dataset.route)));
    });
    $("#moveButton").addEventListener("click", () => safeAction(() => Engine.executeSharedMovement(state)));
  }

  function renderWarpControls() {
    const offer=Engine.currentWarpOffer(state),p=playerById(offer.playerId),needed=p.stage<3?Engine.requiredStageWarp(state,p.stage):Engine.requiredEscapeWarp(state),recommended=Math.min(offer.max,Math.max(0,needed-p.warp));
    els.phaseControls.innerHTML=`<div class="action-box warp-purchase"><h3>补充曲速储备</h3><p>现有 <strong>${p.power}</strong> 动力、<strong>${p.warp}</strong> 曲速。每点花费 ${offer.cost} 动力。</p><label>本次购买数量<input id="warpCount" type="number" min="0" max="${offer.max}" step="1" value="${recommended}" inputmode="numeric"></label><div class="warp-shortcuts"><button class="choice-button" type="button" data-warp-preset="0">不买</button><button class="choice-button" type="button" data-warp-preset="${recommended}">补至门槛</button><button class="choice-button" type="button" data-warp-preset="${offer.max}">买满 ${offer.max} 点</button></div><p id="warpSummary" class="warp-summary" aria-live="polite"></p>${offer.stationIds.length?`<label>跨阶落点<select id="warpStation">${offer.stationIds.map(id=>'<option value="'+id+'">'+escapeHtml(Engine.nodeById(p.stage+1,id).name)+'</option>').join('')}</select></label>`:''}<p class="purchase-note">可一次买多点。跨阶只扣门槛所需曲速，多余储备会带往下一宇宙。</p><button class="primary-button full" id="confirmWarp" type="button">确认购买与推进</button></div>`;
    const refresh=()=>{const raw=$('#warpCount').value,count=Number(raw),valid=raw!==''&&Number.isSafeInteger(count)&&count>=0&&count<=offer.max,total=p.warp+count,cross=p.stage<3&&total>=needed;
      $('#confirmWarp').disabled=!valid;
      $('#warpSummary').textContent=valid?'支付 '+count*offer.cost+' 动力 → 储备 '+total+' 曲速。'+(cross?'进入宇宙'+(p.stage+1)+'支付 '+needed+'，保留 '+(total-needed)+' 曲速。':p.stage===3?'逃离需 '+needed+' 曲速，并合法触发宇宙之眼。':'本阶门槛 '+needed+'，还缺 '+Math.max(0,needed-total)+'。'):'请输入 0—'+offer.max+' 之间的整数。';
      $('#warpStation')?.closest('label').toggleAttribute('hidden',!cross);
    };
    $('#warpCount').addEventListener('input',refresh);els.phaseControls.querySelectorAll('[data-warp-preset]').forEach(b=>b.addEventListener('click',()=>{$('#warpCount').value=b.dataset.warpPreset;refresh();}));
    $('#confirmWarp').addEventListener('click',()=>safeAction(()=>Engine.decideWarpPurchase(state,Number($('#warpCount').value),$('#warpStation')?.value||null)));refresh();
  }

  function renderResponseControls() {
    const responder=Engine.currentResponder(state), available=Engine.availableResponses(state), stack=Engine.responseStackSnapshot(state);
    const orderNames=state.response.order.map((id,index)=>(index===state.response.cursor?'▶':'')+playerById(id).name).join(' → ');
    els.phaseControls.innerHTML='<div class="action-box"><p><strong>'+escapeHtml(responder.name)+'</strong>，要响应这次行动吗？</p><details class="response-timing"><summary>查看响应顺序与结算时机</summary><p>连续一圈无人加牌后，从最后一张开始结算。</p><div class="response-progress"><span>'+escapeHtml(orderNames)+'</span><strong>暂不响应 '+state.response.passes+'/'+state.response.order.length+'</strong></div></details><div class="response-stack">'+stack.map((item,index)=>'<div class="stack-item '+(item.cancelled?'cancelled':'')+'"><span><strong>'+(index===0?'原事件':'第'+index+'层')+'</strong> · '+escapeHtml(item.name)+'</span><span>'+escapeHtml(playerById(item.playerId).name)+'</span></div>').join('')+'</div><p class="response-hand-hint">'+(available.length?'可响应的瞬发牌已在下方手牌中点亮，点牌即可选择目标并确认。':'手中没有适用于当前窗口的瞬发牌。')+'</p>'+(available.length?'<button class="ghost-button full" id="showResponseHand" type="button">查看可响应手牌 ↓</button>':'')+'<button class="secondary-button full" id="passResponse" type="button">暂不响应，继续结算</button></div>';
    $('#showResponseHand')?.addEventListener('click',()=>{setHandFolded(false);selectedHand=null;inspectHand(playerById(HUMAN_ID).hand.findIndex(id=>available.includes(id)));});
    $('#passResponse').addEventListener('click',()=>safeAction(()=>Engine.passResponse(state)));
  }

  function decisionOptions(decision) {
    const player = playerById(decision.playerId);
    if (decision.kind === "teleport") {
      return decision.nodeIds.map((id) => ({ value: id, label: Engine.nodeById(player.stage, id).name }));
    }
    if (decision.kind === "controlled_movement") {
      return decision.allowedNav.flatMap((nav) => decision.routes.map((route) => ({
        value: `${nav}|${route}`,
        label: `${nav ? `超算导航＋${nav}格` : "不使用超算加格"}${player.stage === 3 ? ` · ${route === "long" ? "宇宙之眼长支路" : "短支路"}` : ""}`,
      })));
    }
    if (decision.kind === "discard_equipment_required" || decision.kind === "discard_equipment_reward") {
      const options = decision.slots.map((slot) => ({ value: slot, label: `弃置${slot === "plunder" ? "掠夺" : slot === "trade" ? "交易" : "机动"}装备【${Engine.cardById(player.equipment[slot]).name}】` }));
      if (decision.kind.endsWith("reward")) options.push({ value: "skip", label: "放弃奖励，不弃装备" });
      return options;
    }
    if (decision.kind === "discard_hand_reward") {
      return decision.cards.map((id) => ({ value: id, label: `弃置【${Engine.cardById(id).face}·${Engine.cardById(id).name}】并领取奖励` })).concat({ value: "skip", label: "放弃奖励" });
    }
    if (decision.kind === "wormhole_probe") {
      return [{ value: "native", label: "执行原生虫洞传送" }].concat(Array.from({ length: 6 }, (_, index) => ({ value: String(index + 1), label: `虫洞窥探：改为前进${index + 1}格` })));
    }
    return [];
  }

  function renderDecisionControls() {
    const decision = state.decision;
    const player = playerById(decision.playerId);
    if (decision.kind === "radar_choice") {
      const picked = new Set(decision.picked);
      const ordered = new Set(decision.returnOrder);
      const pickedCards = decision.entries.filter((entry) => picked.has(entry.key));
      const remainingCards = decision.entries.filter((entry) => !picked.has(entry.key) && !ordered.has(entry.key));
      const orderedCards = decision.returnOrder.map((key) => decision.entries.find((entry) => entry.key === key)).filter(Boolean);
      const cardButton = (entry, action, prefix) => {
        const card = Engine.cardById(entry.cardId);
        return `<button class="choice-button radar-card" data-decision="${prefix}:${escapeHtml(entry.key)}" type="button"><strong>${escapeHtml(card.face + "·" + card.name)}</strong><small>${escapeHtml(card.description)}</small></button>`;
      };
      if (decision.stage === "pick") {
        els.phaseControls.innerHTML = `<div class="action-box radar-decision">
          <p><strong style="color:${player.color}">${escapeHtml(player.name)}</strong> 正在使用【${escapeHtml(decision.equipmentName)}】。请选择要取得的牌：<strong>${decision.picked.length}/${decision.count}</strong>。</p>
          ${pickedCards.length ? `<div class="decision-summary"><span>已选</span>${pickedCards.map((entry) => `<b>${escapeHtml(Engine.cardById(entry.cardId).name)}</b>`).join("")}</div>` : ""}
          <div class="choice-buttons radar-grid">${decision.entries.filter((entry) => !picked.has(entry.key)).map((entry) => cardButton(entry, "pick", "pick")).join("")}</div>
          ${decision.picked.length ? '<button class="ghost-button full" data-decision="reset" type="button">重新选择</button>' : ""}
        </div>`;
      } else {
        els.phaseControls.innerHTML = `<div class="action-box radar-decision">
          <p><strong style="color:${player.color}">${escapeHtml(player.name)}</strong> 已选好牌。现在依次点击未选牌，决定牌堆顶顺序；<strong>先点击的牌会最先被下一次摸到</strong>。</p>
          <div class="decision-summary"><span>取得</span>${pickedCards.map((entry) => `<b>${escapeHtml(Engine.cardById(entry.cardId).name)}</b>`).join("")}</div>
          <div class="decision-summary"><span>放回顺序</span>${orderedCards.length ? orderedCards.map((entry, index) => `<b>${index + 1}. ${escapeHtml(Engine.cardById(entry.cardId).name)}</b>`).join("") : '<em>尚未安排</em>'}</div>
          <div class="choice-buttons radar-grid">${remainingCards.map((entry) => cardButton(entry, "order", "order")).join("")}</div>
          <button class="ghost-button full" data-decision="reset" type="button">重新选牌</button>
        </div>`;
      }
      els.phaseControls.querySelectorAll("[data-decision]").forEach((button) => {
        button.addEventListener("click", () => safeAction(() => Engine.resolveDecision(state, button.dataset.decision)));
      });
      return;
    }
    if (decision.kind === "immediate_order") {
      const ordered = new Set(decision.ordered);
      const orderedItems = decision.ordered.map((token) => decision.items.find((item) => item.token === token)).filter(Boolean);
      const remaining = decision.items.filter((item) => !ordered.has(item.token));
      els.phaseControls.innerHTML = `<div class="action-box radar-decision">
        <p><strong style="color:${player.color}">${escapeHtml(player.name)}</strong> 同时获得多张立即牌。请依次点击，决定公开和结算顺序。</p>
        <div class="decision-summary"><span>结算顺序</span>${orderedItems.length ? orderedItems.map((item, index) => `<b>${index + 1}. ${escapeHtml(Engine.cardById(item.cardId).name)}</b>`).join("") : '<em>尚未安排</em>'}</div>
        <div class="choice-buttons radar-grid">${remaining.map((item) => {
          const card = Engine.cardById(item.cardId);
          return `<button class="choice-button radar-card" data-decision="immediate:${escapeHtml(item.token)}" type="button"><strong>${escapeHtml(card.face + "·" + card.name)}</strong><small>${escapeHtml(card.description)}</small></button>`;
        }).join("")}</div>
        ${decision.ordered.length ? '<button class="ghost-button full" data-decision="reset" type="button">重新排序</button>' : ""}
      </div>`;
      els.phaseControls.querySelectorAll("[data-decision]").forEach((button) => {
        button.addEventListener("click", () => safeAction(() => Engine.resolveDecision(state, button.dataset.decision)));
      });
      return;
    }
    const options = decisionOptions(decision);
    els.phaseControls.innerHTML = `<div class="action-box"><p><strong style="color:${player.color}">${escapeHtml(player.name)}</strong> 需要完成当前效果选择：</p>
      <div class="choice-buttons">${options.map((option) => `<button class="choice-button" data-decision="${escapeHtml(option.value)}" type="button">${escapeHtml(option.label)}</button>`).join("")}</div>
    </div>`;
    els.phaseControls.querySelectorAll("[data-decision]").forEach((button) => {
      button.addEventListener("click", () => safeAction(() => Engine.resolveDecision(state, button.dataset.decision)));
    });
  }

  function renderPersonalControls() {
    if(state.mustDiscard){els.phaseControls.innerHTML='<div class="turn-instruction"><h3>整理你的手牌</h3><p>点击下方要弃置的牌，保留最多3张。弃完会自动结束回合。</p></div>';return;}
    els.phaseControls.innerHTML='<div class="turn-instruction"><h3>轮到你了</h3><p>点击手牌，在牌上选目标并确认使用；本回合可以连续出牌。</p></div>';
  }

  function cardActionMarkup(c,p,response) {
    let allowed=false,hint='',params='',label='确认打出';
    const personal=state.phase==='personal'&&Engine.currentPersonalPlayer(state)?.id===HUMAN_ID&&!state.mustDiscard;
    if(response){
      allowed=true;label='确认响应';hint='此牌将加入当前响应链。';
      if(c.action==='annihilate'){
        params='<div class="card-params"><label>选择湮灭目标<select data-annihilate-target>'+Engine.responseTargets(state).map(t=>'<option value="'+escapeHtml(t.key)+'">'+(t.targetType==='stack'?'第'+t.index+'层':'装备')+' · '+escapeHtml(playerById(t.playerId).name)+' · '+escapeHtml(t.name)+'</option>').join('')+'</select></label></div>';
        hint='湮灭选中的未完成牌或场上装备；其余响应继续结算。';
      }
    }else if(personal){
      allowed=c.type!=='instant'||c.action==='annihilate';
      if(!allowed)hint='这张瞬发牌需留到对应响应窗口。';
      if(c.requiresTarget&&!Engine.validTargets(state,c.id,HUMAN_ID).length){allowed=false;hint='当前没有合法目标。';}
      if(c.action==='annihilate'&&!equipmentTargets(HUMAN_ID).length){allowed=false;hint='场上没有可湮灭的装备。';}
      if(allowed)params=cardParameters(c,p,selectedHand);
      if(c.type==='equipment'){
        const current=p.equipment[c.slot],slot={mobility:'机动',trade:'交易',plunder:'掠夺'}[c.slot];
        label=current?'确认替换装备':'装备到'+slot+'槽';
        hint=current?'替换'+slot+'槽的【'+Engine.cardById(current).name+'】，原装备将进入弃牌堆。':'装备到空闲的'+slot+'槽，持续效果会自动生效。';
      }else if(c.action==='annihilate')label='湮灭指定装备';
    }else hint=state.phase==='response'?'此牌不适用于当前响应窗口。':'等待你的个人回合；瞬发牌在适用的响应窗口使用。';
    const title=response?'响应这次行动':c.type==='equipment'?'装备这张牌':'使用这张牌';
    return '<div class="card-inline-actions" role="group" aria-label="'+escapeHtml(c.name)+'操作"><div class="card-action-heading"><strong>'+title+'</strong><button type="button" class="text-button" id="clearCardSelection">取消 ×</button></div>'+params+(hint?'<p class="card-hint">'+escapeHtml(hint)+'</p>':'')+'<button class="primary-button full" id="'+(response?'playResponseCard':'playSelectedCard')+'" type="button" '+(allowed?'':'disabled')+'>'+label+'</button></div>';
  }

  function bindCardActions() {
    const area=els.hand.querySelector('.card-inline-actions');if(!area)return;
    const id=playerById(HUMAN_ID).hand[selectedHand];
    $('#clearCardSelection').addEventListener('click',()=>{const index=selectedHand;selectedHand=null;renderHand();els.hand.querySelector('[data-card-index="'+index+'"] .card-face')?.focus({preventScroll:true});});
    area.querySelectorAll('select').forEach(select=>{if(select.options.length===2&&select.options[0].value==='')select.selectedIndex=1;});
    const button=area.querySelector('#playSelectedCard:not(:disabled),#playResponseCard:not(:disabled)');
    if(!button)return;
    const validate=()=>{button.disabled=[...area.querySelectorAll('select')].some(input=>!input.value);};
    area.querySelectorAll('select').forEach(select=>select.addEventListener('change',validate));validate();
    button.addEventListener('click',()=>safeAction(()=>{
      if(button.id==='playResponseCard'){Engine.playResponse(state,id,area.querySelector('[data-annihilate-target]')?.value||null);return;}
      const params={};
      for(const [selector,key] of [['[data-param-target]','targetId'],['[data-param-node]','nodeId'],['[data-param-steps]','steps'],['[data-param-nav]','navBonus'],['[data-param-route]','routePreference']]){
        const input=area.querySelector(selector);if(input)params[key]=['steps','navBonus'].includes(key)?Number(input.value):input.value;
      }
      const equipment=area.querySelector('[data-param-equipment]');if(equipment)[params.targetId,params.slot]=equipment.value.split('|');
      Engine.playCard(state,id,params);
    },true));
  }

  function renderGameOverControls() {
    const result = state.duelResult;
    const title = !result ? '对局结束' : result.winnerIds.length > 1 ? '同轮逃离 · 平局' : result.winnerIds.includes(HUMAN_ID) ? '你成功逃离了星海' : '星海领航员赢得本局';
    els.phaseTitle.textContent = title;
    els.phaseHelp.textContent = '本局已结束。可以打开本局复盘，或再来一局。';
    els.phaseControls.innerHTML = '<div class="action-box"><p>'+ title + '。同一轮逃离视为平局；认输则立即结束。</p><button class="primary-button full" id="restartButton" type="button">再来一局</button><button class="ghost-button full" id="reviewButton" type="button">查看本局复盘</button></div>';
    $('#restartButton').addEventListener('click', () => els.setupDialog.showModal());
    $('#reviewButton').addEventListener('click', () => {$('#logDialog').showModal();$('#aiReview').open=true;});
  }

  function renderPhaseControls() {
    if (aiToAct() && state.phase !== 'choose') {
      els.phaseControls.innerHTML = diceMarkup() + '<div class="ai-thinking"><span class="thinking-orbit">✦</span><strong>星海领航员正在行动</strong><p>你可以查看地图、自己的手牌和公开记录。</p></div>';
      return;
    }
    if (isHandoffLocked()) {
      renderHandoffCurtain();
      return;
    }
    if (state.phase === "roll") renderRollControls();
    else if (state.phase === "choose") renderChoiceControls();
    else if (state.phase === "warp") renderWarpControls();
    else if (state.phase === "response") renderResponseControls();
    else if (state.phase === "decision") renderDecisionControls();
    else if (state.phase === "personal") renderPersonalControls();
    else if (state.phase === "game_over") renderGameOverControls();
  }

  function statusBadges(player, index) {
    const badges = [];
    if (index === state.rollerIndex && !player.escaped) badges.push('<span class="mini-badge">本轮掷骰</span>');
    if (!player.activeThisRound && !player.escaped) badges.push('<span class="mini-badge skip">本轮跳过</span>');
    if (player.exhausted && !player.escaped) badges.push('<span class="mini-badge skip">能源耗尽</span>');
    if (player.skipSchedule && player.skipSchedule.length && !player.escaped) badges.push(`<span class="mini-badge skip">待跳R${player.skipSchedule[0].round}</span>`);
    if (player.withdrawn) badges.push('<span class="mini-badge withdrawn">已退出</span>');
    else if (player.escaped) badges.push('<span class="mini-badge escape">已逃离</span>');
    return badges.join("");
  }

  function renderPlayers() {
    const focus=currentFocusPlayer(),slots={mobility:'机动',trade:'交易',plunder:'掠夺'};
    els.deckCount.textContent=`常规 ${state.regularDeck.length} / 机遇 ${state.opportunityDeck.length}`;
    els.playerList.innerHTML=state.players.map((p,index)=>{
      const n=Engine.nodeById(p.stage,p.position),needed=p.stage<3?Engine.requiredStageWarp(state,p.stage):Engine.requiredEscapeWarp(state);
      return `<article class="player-row ${p.id===HUMAN_ID?'human-row':'opponent-row'} ${focus?.id===p.id?'active':''} ${p.escaped?'escaped':''}" style="--player-color:${p.color}">
        <div class="pilot-heading"><span class="pilot-emblem">${p.id===HUMAN_ID?'你':'AI'}</span><div><strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong><small>${p.withdrawn?'已认输':p.escaped?'已逃离':'宇宙'+p.stage+' · '+escapeHtml(n.short)}</small></div><div class="status-badges">${statusBadges(p,index)}</div></div>
        <div class="hud-resources"><span title="能源为0会跳轮"><span class="resource-label" data-short="能">能源</span> <b>${p.energy}<small>/10</small></b></span><span title="用于交易和购买曲速"><span class="resource-label" data-short="动">动力</span> <b>${p.power}</b></span><span class="warp-resource" title="曲速没有库存上限。跨阶仅支付所需数量，余量保留。"><span class="resource-label" data-short="曲">曲速</span> <b>${p.warp}</b><small>${p.stage<3?'下阶':'逃离'}需${needed}</small></span><span><span class="resource-label" data-short="手">手牌</span> <b>${p.hand.length}</b></span></div>
        ${p.id===AI_ID?'<button class="opponent-equipment-button ghost-button" type="button" aria-label="查看对手状态与全部装备">详情</button>':''}<div class="equipment-rack">${Object.entries(slots).map(([slot,label])=>{const id=p.equipment[slot],c=id&&Engine.cardById(id);return `<button class="equipment-slot ${c?'occupied':'empty'}" data-equipment-player="${p.id}" data-equipment-slot="${slot}" type="button" aria-controls="equipmentPopover" aria-expanded="false" aria-label="${escapeHtml(p.name+'，'+label+'槽，'+(c?c.name+'，'+c.description:'未装备'))}" data-hover-title="${escapeHtml(label+'槽 · '+(c?c.name:'未装备'))}" data-hover-text="${escapeHtml(c?c.description:'可装备一件'+label+'装备。点击查看全部装备。')}"><span class="slot-label">${label}</span><strong class="slot-name">${c?escapeHtml(c.name):'未装备'}</strong><small class="slot-effect">${c?escapeHtml(equipmentSummary(c)):'等待装配'}</small></button>`;}).join('')}</div>
      </article>`;
    }).join('');
    els.playerList.querySelectorAll('[data-equipment-player]').forEach(b=>b.addEventListener('click',()=>openEquipment(b.dataset.equipmentPlayer,b.dataset.equipmentSlot,b)));
    bindHoverDetails(els.playerList);
    $('.opponent-equipment-button')?.addEventListener('click',()=>{
      const p=playerById(AI_ID);$('#equipmentTitle').textContent=p.name+' · 公开状态';
      $('#equipmentBody').innerHTML='<p>宇宙'+p.stage+' · '+escapeHtml(Engine.nodeById(p.stage,p.position).name)+'</p><p>'+statusBadges(p,1)+'</p>'+Object.entries(slots).map(([slot,label])=>{const c=p.equipment[slot]&&Engine.cardById(p.equipment[slot]);return '<section class="opponent-equipment-detail"><h3>'+label+' · '+(c?escapeHtml(c.name):'未装备')+'</h3><p>'+(c?escapeHtml(c.description):'此槽为空')+'</p></section>';}).join('');$('#equipmentDialog').showModal();
    });
    const human=playerById(HUMAN_ID);
    $('#concedeButton').disabled=human.escaped||Boolean(state.duelResult)||!['roll','choose','personal','response'].includes(state.phase)||(['personal','response'].includes(state.phase)&&currentFocusPlayer()?.id!==HUMAN_ID);
  }

  function renderRanking() {
    if (!state.placements.length) {
      els.rankingList.innerHTML = '<div class="empty-state" style="min-height:70px">尚无人逃离</div>';
      return;
    }
    els.rankingList.innerHTML = state.placements.map((place, index) => {
      const names = place.playerIds.map((id) => playerById(id).name).join("、");
      return `<div class="ranking-item"><strong>${place.rank === 1 ? "冠军" : `第${place.rank}名`}${place.playerIds.length > 1 ? "（并列）" : ""}</strong> · ${escapeHtml(names)}<br><span class="meta-label">第${place.round}轮逃离</span></div>`;
    }).join("");
  }

  function equipmentTargets(actorId = null) {
    const result = [];
    state.players.forEach((player) => {
      if (actorId && player.id !== actorId && Engine.isFortressProtected(player)) return;
      Object.entries(player.equipment).forEach(([slot, id]) => {
        if (id) result.push({ value: `${player.id}|${slot}`, label: `${player.name} · ${Engine.cardById(id).name}` });
      });
    });
    return result;
  }

  function cardParameters(card, actor, index) {
    const parts = [];
    if (card.requiresTarget) {
      const targets = Engine.validTargets(state, card.id, actor.id);
      parts.push(`<select data-param-target><option value="">请选择目标</option>${targets.map((id) => {
        const target = playerById(id);
        return `<option value="${id}">${escapeHtml(target.name)} · 宇宙${target.stage} · 能源${target.energy} / 动力${target.power}</option>`;
      }).join("")}</select>`);
    }
    if (card.requiresNode) {
      const nodeOptions = [1, 2, 3].flatMap((stage) => Engine.universe(stage).nodes
        .map((node) => `<option value="${node.id}">宇宙${stage} · ${escapeHtml(node.name)}</option>`)).join("");
      parts.push(`<select data-param-node><option value="">请选择任一宇宙的地图格</option>${nodeOptions}</select>`);
    }
    if (card.action === "moveSelf" || card.action === "moveOther") {
      parts.push(`<select data-param-steps><option value="">请选择移动格数</option>${Array.from({ length: card.maxSteps - card.minSteps + 1 }, (_, offset) => `<option value="${card.minSteps + offset}">移动${card.minSteps + offset}格</option>`).join("")}</select>`);
    }
    if (card.action === "moveSelf") {
      if (Object.values(actor.equipment).includes('supernav')) parts.push('<select data-param-nav><option value="0">超算导航不加格</option><option value="1">若目标有超算导航：+1格</option><option value="2">若目标有超算导航：+2格</option></select>');
      if (actor.stage === 3) parts.push('<select data-param-route><option value="short">若经过第三宇宙左下分岔：短支路</option><option value="long">若经过第三宇宙左下分岔：宇宙之眼长支路</option></select>');
    } else if (card.action === "moveOther") {
      parts.push('<small>基础格数由出牌者指定；响应结束后，由被移动者本人选择是否发动超算导航及第三宇宙分岔。</small>');
    }
    if (card.type === "instant" && card.action === "annihilate") {
      const targets = equipmentTargets(actor.id);
      parts.push(`<select data-param-equipment><option value="">请选择要湮灭的装备</option>${targets.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join("")}</select>`);
    }
    const labels={'target':'选择目标','node':'选择地图格','steps':'移动格数','nav':'超算导航','route':'分岔路线','equipment':'湮灭装备'};
    return parts.length ? '<div class="card-params">'+parts.map(part=>{const key=part.match(/data-param-(\w+)/)?.[1];return key?'<label>'+labels[key]+part+'</label>':part;}).join('')+'</div>' : '';
  }

  function visibleHandOwner() {
    return playerById(HUMAN_ID);
  }

  function renderHand() {
    const scrollLeft=els.hand.scrollLeft;
    const previous=els.hand.querySelector('.selected'),draftId=previous?.dataset.cardId||playerById(HUMAN_ID)?.hand[selectedHand],draft=previous?[...previous.querySelectorAll('select')].map(n=>n.value):(cardDrafts.get(draftId)||[]);
    const p=playerById(HUMAN_ID),personal=state.phase==='personal'&&Engine.currentPersonalPlayer(state)?.id===HUMAN_ID,discarding=personal&&state.mustDiscard;
    const responding=state.phase==='response'&&Engine.currentResponder(state)?.id===HUMAN_ID, available=responding?Engine.availableResponses(state):[];
    if(discarding)setHandFolded(false);
    els.handTitle.textContent=discarding?'整理手牌':responding?'你的手牌 · 瞬发响应':personal?'你的手牌 · 选择出牌':'你的手牌';
    els.handCount.textContent=p.hand.length+'张';els.hand.className='hand'+(discarding?' discard-mode':'');
    if(selectedHand!==null&&!p.hand[selectedHand])selectedHand=null;
    els.hand.innerHTML=p.hand.map((id,index)=>{
      const c=Engine.cardById(id),response=available.includes(id),canPlay=personal&&(discarding||c.type!=='instant'||c.action==='annihilate'),selected=selectedHand===index;
      const hint=discarding?'点击弃置此牌':response?'当前可响应 · 点击在牌上操作':canPlay?(c.type==='equipment'?'点击在牌上装备':'点击在牌上使用'):c.type==='instant'?'保留至对应响应时机':'等待你的个人回合';
      return '<article class="game-card '+c.type+(selected?' selected':'')+(canPlay||response?' playable':'')+'" data-card-id="'+id+'" data-card-index="'+index+'"><button type="button" class="card-face" aria-expanded="'+selected+'" aria-label="'+escapeHtml(c.name+'，'+c.description)+'"><span class="card-meta"><span>'+escapeHtml(c.face)+'</span><span>'+(c.type==='equipment'?'装备 · '+({mobility:'机动',trade:'交易',plunder:'掠夺'})[c.slot]:c.type==='instant'?'瞬发':'行动')+'</span></span><span class="card-emblem" aria-hidden="true">'+cardEmblem(c)+'</span><strong class="card-title">'+escapeHtml(c.name)+'</strong><span class="card-description">'+escapeHtml(c.description)+'</span><span class="card-use-hint">'+hint+'</span></button>'+(selected&&!discarding?cardActionMarkup(c,p,response):'')+'</article>';
    }).join('')||'<div class="empty-state">手牌暂空 · 探索星域，获取新的选择</div>';
    els.hand.querySelectorAll('.card-face').forEach(b=>b.addEventListener('click',()=>inspectHand(Number(b.closest('[data-card-index]').dataset.cardIndex))));
    els.turnActions.innerHTML=personal&&!discarding?'<button class="primary-button" id="endTurnButton" type="button">结束回合 →</button>':discarding?'<span class="discard-counter">还需弃'+Math.max(0,p.hand.length-3)+'张</span>':responding?'<button class="secondary-button" id="passResponseInHand" type="button">暂不响应 →</button>':'<span class="hand-note">完整牌面 · 横向滑动浏览</span>';
    $('#endTurnButton')?.addEventListener('click',()=>safeAction(()=>Engine.endPersonalTurn(state),true));
    $('#passResponseInHand')?.addEventListener('click',()=>safeAction(()=>Engine.passResponse(state),true));
    const selected=els.hand.querySelector('.selected');
    if(selected&&selected.dataset.cardId===draftId)selected.querySelectorAll('select').forEach((n,i)=>{if([...n.options].some(o=>o.value===draft[i]))n.value=draft[i];});
    bindCardActions();els.hand.scrollLeft=scrollLeft;
    $('#toggleHandButton').textContent=document.body.classList.contains('hand-folded')?'手牌 '+p.hand.length+' ↑':'收起手牌 ↓';
  }

  function renderLog() {
    const aiName = playerById(AI_ID)?.name;
    const events = state.log.filter(event => !(state.phase === 'choose' && !state.choices[HUMAN_ID] && event.message.startsWith(aiName) && /公开选择|分岔预设/.test(event.message)));
    els.eventLog.innerHTML = events.map((event) => {
      let message = event.privateTo && event.privateTo !== HUMAN_ID ? event.publicMessage || '对手完成私密操作。' : event.message;
      // Also mask older 0.5 saves made before the visibility metadata was added.
      if (!event.privateTo && message.startsWith(aiName + ' 获得机遇装备【')) message = aiName + ' 获得1张机遇装备。';
      return `<li class="${event.tone}"><span class="round-tag">R${event.round}</span><span>${escapeHtml(message)}</span></li>`;
    }).join("");
  }

  function render() {
    if (!state) return;
    closeEquipmentPopover();
    renderPhaseRail();
    renderMap();
    renderRoundMeta();
    renderPhaseControls();
    renderPlayers();
    renderRanking();
    renderHand();
    renderLog();
    renderAiPanel();
    scheduleAi();
  }

  function renderParticipantSetup() {
    const previous = Array.from(els.participantSetup.querySelectorAll(".participant-row")).map((row) => ({
      name: row.querySelector("[data-player-name]")?.value || "",
      station: row.querySelector("[data-start-station]")?.value || "",
    }));
    const count = Number(els.playerCount.value);
    const stations = Data.universes[0].stationIds;
    els.participantSetup.innerHTML = `<p class="meta-label">玩家名称与第一宇宙起点</p>${Array.from({ length: count }, (_, index) => {
      const saved = previous[index] || {};
      const name = saved.name || (index === 0 ? "你" : "星海领航员");
      const station = stations.includes(saved.station) ? saved.station : stations[index % stations.length];
      return `<div class="participant-row">
        <span class="participant-number">P${index + 1}</span>
        <input data-player-name maxlength="16" value="${escapeHtml(name)}" aria-label="玩家${index + 1}名称" />
        <select data-start-station aria-label="玩家${index + 1}起点">${stations.map((id) => `<option value="${id}" ${id === station ? "selected" : ""}>${escapeHtml(Engine.nodeById(1, id).name)}</option>`).join("")}</select>
      </div>`;
    }).join("")}`;
  }

  function newGameFromSetup() {
    const rows = Array.from(els.participantSetup.querySelectorAll(".participant-row"));
    cancelAi();
    state = Engine.createGame({
      playerCount: 2,
      mode: els.gameMode.value,
      skipMode: els.skipMode.value,
      privacyMode: false,
      seed: els.seedInput.value.trim() ? Number(els.seedInput.value) : crypto.getRandomValues(new Uint32Array(1))[0],
      names: rows.map((row, index) => row.querySelector("[data-player-name]").value.trim() || `玩家${index + 1}`),
      startStations: rows.map((row) => row.querySelector("[data-start-station]").value),
    });
    voyageStarted = true;
    selectedHand = null;
    cardDrafts.clear();
    setHandFolded(compactScreen.matches);
    state.duel = true;
    state.aiMode = 'local';
    state.aiHistory = [];
    aiStatus = "本地策略已就绪"; lastAiAction = "等待启航";
    mapViewStage = 1;
    privacyUnlockedKey = null;
    persistAutosave();
    render();
  }

  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    newGameFromSetup();
    els.setupDialog.close();
    scheduleAi();
  });
  els.playerCount.addEventListener("change", renderParticipantSetup);
  els.gameMode.addEventListener('change',()=>{ $('#setupModeHint').textContent=({experience:'体验局缩短资源积累，保留完整地图、卡牌和响应规则。',quick:'快速局保留标准推进节奏，需要更多资源规划与反制。',immersive:'沉浸局提高曲速门槛，给装备经营和长期博弈更多空间。'})[els.gameMode.value]; });
  els.rulesButton.addEventListener("click", () => els.rulesDialog.showModal());
  els.closeRulesButton.addEventListener("click", () => els.rulesDialog.close());
  els.newButton.addEventListener("click", () => {
    updateRestoreButton();
    els.setupDialog.showModal();
  });
  els.cancelSetupButton.addEventListener("click", () => {els.setupDialog.close(); scheduleAi();});
  els.setupDialog.addEventListener("close", scheduleAi);
  els.rulesDialog.addEventListener("close", scheduleAi);
  $('#toggleHandButton').addEventListener('click',()=>setHandFolded(!document.body.classList.contains('hand-folded')));
  $('#handBackdrop').addEventListener('click',()=>setHandFolded(true));
  els.hand.addEventListener('change',e=>{const card=e.target.closest('.game-card.selected');if(card&&!card.querySelector('[data-annihilate-target]'))cardDrafts.set(card.dataset.cardId,[...card.querySelectorAll('select')].map(n=>n.value));});
  $('#mapZoomButton').addEventListener('click',()=>{mapZoom=!mapZoom;renderMap();requestAnimationFrame(focusMapOnPlayer);});
  $('#mapFocusButton').addEventListener('click',focusMapOnPlayer);
  phoneLandscape.addEventListener('change',syncPhoneLayout);
  compactScreen.addEventListener('change',syncPhoneLayout);
  let resizeFrame;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{layoutMap();focusMapOnPlayer();});});
  $('#fullscreenButton').hidden=!document.documentElement.requestFullscreen;
  $('#fullscreenButton').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
    catch(_){showToast('当前浏览器暂不支持全屏，可直接横屏游玩。');}
  });
  document.addEventListener('fullscreenchange',()=>{$('#fullscreenButton').textContent=document.fullscreenElement?'退出全屏':'全屏';syncPhoneLayout();});
  window.addEventListener('scroll',hideHoverDetail,true);
  window.addEventListener('resize',hideHoverDetail);
  window.addEventListener('scroll',positionEquipmentPopover,true);
  window.addEventListener('resize',positionEquipmentPopover);
  document.addEventListener('click',e=>{
    if(!e.target.closest('#equipmentPopover, .equipment-slot'))closeEquipmentPopover();
    if(selectedHand!==null&&!e.target.closest('.game-card, .hand-panel, .map-panel, .topbar, #equipmentPopover, .equipment-slot, #showResponseHand, dialog')){
      selectedHand=null;renderHand();
    }
  });
  document.querySelectorAll('dialog').forEach(dialog=>{
    let pressedOutside=false;
    const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
    dialog.addEventListener('pointerdown',e=>{pressedOutside=e.target===dialog&&outside(e);});
    dialog.addEventListener('click',e=>{if(pressedOutside&&e.target===dialog&&outside(e)&&(dialog.id!=='setupDialog'||voyageStarted))dialog.close();pressedOutside=false;});
    dialog.addEventListener('cancel',e=>{if(dialog.id==='setupDialog'&&!voyageStarted)e.preventDefault();});
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')){hideHoverDetail();if(!$('#equipmentPopover').hidden){closeEquipmentPopover(true);return;}const index=selectedHand;if(index===null&&compactScreen.matches&&!document.body.classList.contains('hand-folded')){setHandFolded(true);$('#toggleHandButton').focus({preventScroll:true});return;}selectedHand=null;renderHand();els.hand.querySelector('[data-card-index="'+index+'"] .card-face')?.focus({preventScroll:true});}});
  els.restoreAutoButton.addEventListener("click", () => {
    try {
      restoreFromStorage(AUTO_STORAGE_KEY, "自动存档");
      voyageStarted = true;
      els.setupDialog.close();
      showToast("已恢复最近自动存档");
    } catch (error) {
      console.error(error);
      showToast(error.message || "自动存档损坏");
    }
  });
  els.saveButton.addEventListener("click", () => {
    if (!state) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showToast("完整局面已保存到当前浏览器");
    } catch (error) {
      console.error(error);
      showToast("浏览器保存失败，请使用“导出存档”备份");
    }
  });
  els.loadButton.addEventListener("click", () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      showToast("当前浏览器没有人机对战版本存档");
      return;
    }
    try {
      restoreFromStorage(STORAGE_KEY, "人机对战版本手动存档");
      showToast("已恢复人机对战版本局面");
    } catch (error) {
      console.error(error);
      showToast(error.message || "存档损坏");
    }
  });
  els.exportButton.addEventListener("click", () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `逃离星海_第${state.round}轮_存档.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("存档文件已导出");
  });
  els.importButton.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", async () => {
    const file = els.importInput.files && els.importInput.files[0];
    if (!file) return;
    try {
      if (!window.confirm("导入会替换当前局面；如需保留，请先导出当前存档。是否继续？")) return;
      const restored = normalizeRestoredState(JSON.parse(await file.text()));
      cancelAi();
      state = restored; cardDrafts.clear();
      voyageStarted = true;
      selectedHand = null;
      privacyUnlockedKey = null;
      followActiveStage();
      persistAutosave();
      render();
      showToast(`已导入第${state.round}轮存档`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "导入文件无效");
    } finally {
      els.importInput.value = "";
    }
  });


  $('#menuButton').addEventListener('click',()=>$('#menuDialog').showModal());
  document.querySelectorAll('[data-mobile-view]').forEach(button=>button.addEventListener('click',()=>setMobileView(button.dataset.mobileView)));
  new ResizeObserver(positionMapTokens).observe(els.mapStage);
  $('#logButton').addEventListener('click',()=>$('#logDialog').showModal());
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',scheduleAi));
  $('#concedeButton').addEventListener('click',()=>{if(window.confirm('认输并结束本局？')){$('#menuDialog').close();safeAction(()=>Engine.withdrawPlayer(state,HUMAN_ID));}});
  ['saveButton','loadButton','exportButton','newButton'].forEach(id=>$('#'+id).addEventListener('click',()=>$('#menuDialog').close()));

  els.prototypeRulings.innerHTML = Data.prototypeRulings.map((text) => `<li>${escapeHtml(text)}</li>`).join("");
  renderParticipantSetup();
  state = Engine.createGame({ playerCount: 2, mode: "experience", skipMode: "loose", privacyMode: false, seed: 20260916, names:["你","星海领航员"] });
  state.duel = true; state.aiMode = "local"; state.aiHistory = [];
  render();
  updateRestoreButton();
  els.setupDialog.showModal();
  checkApi();
  syncPhoneLayout();
})();
