/* Public encounter projection for the local AI edition, 1.0.4.
 * Adapted from ../朋友试玩版_1.1.2/server/encounter.cjs on 2026-10-19.
 * The multiplayer source remains unchanged. This module never reads hands,
 * decks, pending private choices, RNG state, AI reasoning, or event logs.
 */
(function attachStarSeaEncounter(root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./game-core.js'), require('./game-data.js'));
  } else {
    root.StarSeaEncounter = factory(root.EscapeStarSeaEngine, root.EscapeStarSeaData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEncounterView(E, D) {
  'use strict';
  const SLOTS = { mobility: '机动', trade: '交易', plunder: '掠夺' };
  const KINDS = new Set(['map', 'equipment_trigger', 'equipment', 'annihilate_equipment', 'plunder', 'trade', 'card', 'immediate']);
  const PENDING = '尚未结算；响应牌、场上装备与结算时的合法性检查可能改变结果。';
  const cardById = id => E?.cardById?.(id);
  const allNodes = () => (D?.universes || []).flatMap(u => u.nodes);
  const name = p => typeof p?.name === 'string' && p.name.trim() ? p.name : '玩家';

  // Explicitly construct every field. Never spread root, params, players,
  // response stack, or context: those objects may contain private information.
  function publicEncounter(state) {
    const actionRoot = state?.response?.root;
    if (!actionRoot) return null;
    const players = state.players || [];
    const byId = id => players.find(p => p.id === id);
    const actor = byId(actionRoot.actorId);
    const actorName = name(actor);
    const card = cardById(actionRoot.cardId);
    const cardName = card?.name || '当前牌';
    const params = actionRoot.params || {};
    const target = byId(params.targetId);
    const node = allNodes().find(n => n.id === actionRoot.nodeId);
    const view = {
      kind: KINDS.has(actionRoot.kind) ? actionRoot.kind : 'effect',
      actorId: actor?.id || null,
      targetIds: [],
      title: `${actorName} 发起待结算效果`,
      effect: card?.description || '当前效果等待响应结束后结算。',
      context: '',
      uncertainty: PENDING,
    };
    const setTarget = player => { view.targetIds = player ? [player.id] : []; };

    if (actionRoot.kind === 'map') {
      setTarget(actor);
      view.title = `${actorName} 触发${node ? `【${node.name}】` : '地图格效果'}`;
      view.effect = node?.description || '地图效果等待响应结束后结算。';
      view.context = actionRoot.trigger === 'transition' ? '跨宇宙后的驿站效果。'
        : actionRoot.trigger === 'teleport' ? '传送目的地的地图效果。' : '本次落点的地图效果。';
      if (actionRoot.suppressBaseDraw === true) view.context += '本次不进行常规摸牌。';
      return view;
    }
    if (actionRoot.kind === 'equipment_trigger') {
      const equipment = cardById(actionRoot.equipmentCardId);
      setTarget(actor);
      view.title = `${actorName} 的${equipment ? `【${equipment.name}】` : '装备'}触发经过效果`;
      view.effect = equipment?.description || '装备的经过效果等待结算。';
      view.context = node ? `经过【${node.name}】；这是经过触发，不是落点结算。` : '这是经过触发，不是落点结算。';
      view.uncertainty = '尚未结算；若该装备在响应中离场，本次经过触发不结算。';
      return view;
    }

    const immediateUnequip = actionRoot.kind === 'immediate' &&
      (actionRoot.action === 'unequip_any' || actionRoot.action === 'immediate_unequip' || card?.id === 'immediate_unequip');
    if (actionRoot.kind === 'annihilate_equipment' || immediateUnequip) {
      const slot = Object.hasOwn(SLOTS, params.slot) ? params.slot : null;
      // The declared card ID, not whatever now occupies the slot, identifies
      // the target. Missing old snapshots must not be replaced with new cards.
      const declaredEquipment = cardById(params.equipmentCardId);
      const validSnapshot = declaredEquipment?.type === 'equipment' && declaredEquipment.slot === slot;
      const stillPresent = validSnapshot && target?.equipment?.[slot] === declaredEquipment.id;
      setTarget(target);
      view.title = `${actorName} 对${name(target)}的装备使用【${cardName}】`;
      view.effect = '尝试弃置已声明的目标装备；等待响应结束后结算。';
      if (validSnapshot) {
        view.context = `声明目标：${name(target)}的${SLOTS[slot]}槽【${declaredEquipment.name}】。`;
        if (!stillPresent) view.context += '原目标装备已离场。';
      } else {
        view.context = slot ? `声明目标：${name(target)}的${SLOTS[slot]}装备槽，等待响应结束后结算。`
          : '目标装备信息不完整，以结算时的合法性检查为准。';
      }
      if (immediateUnequip) view.uncertainty = '尚未结算；原目标装备离场或不再合法时，本次卸甲不影响其他装备。';
      return view;
    }
    if (actionRoot.kind === 'plunder') {
      if (card?.range === 'area' && !actionRoot.transformed) {
        const universe = (D?.universes || []).find(u => u.nodes.some(n => n.id === params.nodeId));
        const center = universe?.nodes.find(n => n.id === params.nodeId);
        const area = center ? E.__debug.adjacentNodeIds(universe.index, center.id) : new Set();
        const affected = players.filter(p => p.id !== actor?.id && !p.escaped && p.stage === universe?.index && area.has(p.position));
        view.targetIds = affected.map(p => p.id);
        view.title = `${actorName} 对${center ? `【${center.name}】周边` : '选定区域'}发起【${cardName}】`;
        view.context = `范围内玩家：${affected.length ? affected.map(name).join('、') : '当前无人'}。各目标是否受影响仍需结算检查。`;
      } else {
        setTarget(target);
        view.title = `${actorName} 向${name(target)}发起【${cardName}】`;
        view.context = `声明时的掠夺目标：${name(target)}。`;
      }
      if (actionRoot.transformed === true && card?.action === 'trade') {
        view.effect = '【强取豪夺】将此牌替换为超距掠夺Ⅱ：选择更高宇宙的玩家，掠夺30动力。';
        view.context += '本次是掠夺，不进行原牌的交易。';
      }
      return view;
    }
    if (actionRoot.kind === 'trade') {
      setTarget(target);
      view.title = `${actorName} 与${name(target)}发起【${cardName}】`;
      view.context = '这是待结算的强制交换。牌面基础数值可能受公开装备影响，以结算时双方资源和装备为准。';
      return view;
    }
    if (actionRoot.kind === 'equipment') {
      setTarget(actor);
      view.title = `${actorName} 尝试装备【${cardName}】`;
      view.context = Object.hasOwn(SLOTS, card?.slot) ? `装备到自己的${SLOTS[card.slot]}槽；效果尚未生效。` : '装备效果尚未生效。';
      return view;
    }
    if (card?.action === 'moveOther' || card?.action === 'moveSelf') {
      const moved = card.action === 'moveSelf' ? actor : target;
      const steps = Number.isInteger(params.steps) && params.steps >= card.minSteps && params.steps <= card.maxSteps ? params.steps : null;
      setTarget(moved);
      view.title = `${actorName} 使用【${cardName}】移动${name(moved)}`;
      view.context = steps === null ? '移动尚未执行。' : `声明的基础移动为前进 ${steps} 格。`;
      if (card.action === 'moveOther') view.context += '目标玩家随后可选择合法导航加成；触发最终格，不常规摸牌。';
      else {
        const nav = actor?.equipment?.mobility === 'supernav' && params.navBonus === 1 ? 1 : 0;
        if (nav) view.context += '已选超算导航加 1 格。';
        view.context += '触发终点地图效果，不常规摸牌。';
      }
      return view;
    }
    if (card) {
      setTarget(actor);
      view.title = `${actorName} ${actionRoot.kind === 'immediate' ? '公开立即牌' : '使用'}【${cardName}】`;
      view.context = '仅说明已公开的牌面效果；尚未取得的牌不会提前公开。';
    }
    return view;
  }

  return Object.freeze({ publicEncounter });
});
