(function attachStarSeaAI(root) {
  "use strict";
  const E = root.EscapeStarSeaEngine || require("./game-core.js");
  const D = root.EscapeStarSeaData || require("./game-data.js");
  const copy = value => JSON.parse(JSON.stringify(value));
  const pick = (source, keys) => Object.fromEntries(keys.filter(k => source && source[k] !== undefined).map(k => [k, copy(source[k])]));
  const card = E.cardById;
  const node = E.nodeById;
  const equipment = p => Object.values(p.equipment || {});
  const has = (p, id) => equipment(p).includes(id);
  const me = o => o.players.find(p => p.id === o.aiId);
  const player = (o, id) => o.players.find(p => p.id === id);
  const routes = p => p.stage === 3 ? ["short", "long"] : [p.routePreference];
  const publicParams = source => pick(source, ["targetId", "nodeId", "slot", "steps", "navBonus", "routePreference"]);
  function publicRoot(source) {
    if (!source) return null;
    return { ...pick(source, ["kind", "actorId", "playerId", "cardId", "action", "stage", "nodeId", "trigger", "triggerKind", "equipmentCardId", "transformed", "cancelled"]), params: publicParams(source.params), context: pick(source.context, ["bright", "dark", "double", "reversed", "broken", "protected"]) };
  }
  function getActor(state) {
    if (state.phase === "game_over") return null;
    if (state.phase === "response") return E.currentResponder(state)?.id || null;
    if (state.phase === "decision") return state.decision?.playerId || null;
    if (state.phase === "warp") return E.currentWarpOffer(state)?.playerId || null;
    if (state.phase === "personal") return E.currentPersonalPlayer(state)?.id || null;
    if (state.phase === "roll") return state.players[state.rollerIndex]?.id || null;
    if (state.phase === "choose") {
      // Commit the computer's simultaneous choice before asking the human.
      return state.players.slice().reverse().find(p => !p.escaped && p.activeThisRound && !state.choices[p.id])?.id || null;
    }
    return null;
  }
  function buildObservation(state, aiId = "player_2") {
    const players = state.players.map(p => ({
      ...pick(p, ["id", "name", "stage", "position", "energy", "power", "warp", "routePreference", "activeThisRound", "escaped", "withdrawn", "exhausted", "fortressProtected"]),
      equipment: pick(p.equipment, ["plunder", "trade", "mobility"]),
      skipSchedule: (p.skipSchedule || []).map(x => pick(x, ["round", "source"])),
      recoverySchedule: (p.recoverySchedule || []).map(x => pick(x, ["round", "energy"])),
      handCount: p.hand.length,
      ...(p.id === aiId ? { hand: p.hand.slice() } : {}),
    }));
    const response = state.response ? {
      root: publicRoot(state.response.root),
      stack: state.response.stack.map(s => ({ ...pick(s, ["playerId", "cardId", "action", "targetIndex", "cancelled"]), ...(s.annihilationTarget ? { annihilationTarget: pick(s.annihilationTarget, ["type", "index", "playerId", "slot", "cardId"]) } : {}) })),
      ...pick(state.response, ["order", "cursor", "passes"]),
    } : null;
    let decision = null;
    const d = state.decision;
    if (d && d.playerId === aiId) {
      decision = { ...pick(d, ["kind", "playerId", "controllerId", "nodeId", "nodeIds", "slots", "cards", "reward", "steps", "allowedNav", "routes", "drawKind", "count", "stage", "picked", "returnOrder", "ordered"]), action: publicRoot(d.action) };
      if (d.entries) decision.entries = d.entries.map(x => pick(x, ["key", "cardId"]));
      if (d.items) decision.items = d.items.map(x => pick(x, ["token", "cardId"]));
    }
    const offer = E.currentWarpOffer(state);
    return {
      schemaVersion: 1, aiId, actorId: state.phase === "choose" && !state.choices[aiId] && players.find(p => p.id === aiId)?.activeThisRound ? aiId : getActor(state),
      ...pick(state, ["mode", "skipMode", "round", "phase", "dice", "mustDiscard"]), players,
      ownChoice: state.choices[aiId] ? pick(state.choices[aiId], ["key", "value"]) : null,
      response, decision, warpOffer: offer ? pick(offer, ["playerId", "cost", "max", "stationIds"]) : null,
      deckCounts: { regular: state.regularDeck.length, opportunity: state.opportunityDeck.length },
      discardCounts: { regular: state.regularDiscard.length, opportunity: state.opportunityDiscard.length },
    };
  }
  // This anonymous state exists solely for public legality checks and exact
  // deterministic resource transfers. It never copies a live deck or RNG.
  function rulesState(o) {
    return { ...copy(o), players: o.players.map(p => ({ ...copy(p), hand: p.id === o.aiId ? (p.hand || []).slice() : [] })), personalOrder: [o.actorId], personalIndex: 0, choices: {}, log: [], nextEventId: 1, seed: 0, regularDeck: [], opportunityDeck: [], regularDiscard: [], opportunityDiscard: [] };
  }
  const requirement = (o, p) => p.stage < 3 ? E.requiredStageWarp(o, p.stage) : E.requiredEscapeWarp(o);
  const need = (o, p) => Math.max(0, requirement(o, p) - p.warp);
  function distance(p, target) {
    if (p.position === target) return 0;
    const queue = [[p.position, 0]], seen = new Set();
    while (queue.length) {
      const [id, d] = queue.shift();
      if (id === target) return d;
      if (seen.has(id)) continue;
      seen.add(id);
      (node(p.stage, id)?.next || []).forEach(n => queue.push([n, d + 1]));
    }
    return 30;
  }
  function energyValue(value) {
    const v = Math.max(0, Math.min(10, value));
    return [ -37, -19, -10, -3, 3, 8, 12, 15, 17.5, 19.5, 21 ][Math.floor(v)] + (v % 1) * 2;
  }
  function equipValue(o, p, id) {
    if (!id) return 0;
    const hand = p.hand || [];
    const count = action => hand.filter(id => card(id)?.action === action).length;
    const base = { dispersed_array: 3, energy_field: 5, engine_shield: 7, power_field: 8, double_plunder: 13, self_loop: 4, energy_discount: 5, power_discount: 7, force_take: 3, double_trade: 12, delisted: 19, reclusive: 20, warp_discount: 9, dyson_sphere: p.stage === 1 ? 22 : 1, wormhole_probe: p.stage > 1 ? 17 : 3, space_probe: p.stage === 3 ? 17 : 2, supernav: 24, wide_radar: 20, deep_radar: 12, supercharge: 24, time_stack: 15 }[id] || 4;
    if (id === "reclusive") return base - count("plunder") * 7;
    if (id === "delisted") return base - count("trade") * 6;
    if (["energy_field", "power_field", "double_plunder"].includes(id)) return base + count("plunder") * 4;
    if (["self_loop", "energy_discount", "power_discount", "double_trade"].includes(id)) return base + count("trade") * 3;
    if (id === "force_take") return base + count("trade") * (o.players.some(q => q.id !== p.id && q.stage > p.stage) ? 8 : -3);
    if (id === "warp_discount") return base + need(o, p) * 1.8;
    return base;
  }
  function handValue(o, p, id) {
    const c = card(id);
    if (!c) return 0;
    if (c.type === "equipment") return Math.max(1.5, equipValue(o, p, id) - equipValue(o, p, p.equipment[c.slot]) - 1);
    if (c.action === "annihilate") {
      const copies = (p.hand || []).filter(x => card(x)?.action === "annihilate").length;
      const rivalThreat = o.players.some(q => q.id !== p.id && q.stage === 3 && q.warp >= E.requiredEscapeWarp(o));
      return (copies > 1 ? 11 : 18) + (rivalThreat ? 10 : 0);
    }
    if (c.action === "moveSelf") return 7 + (p.power >= E.warpCost(p) * need(o, p) ? 6 : 0);
    if (c.action === "moveOther") return 11;
    if (c.action === "map_bright") return p.energy < 5 ? 13 : 8;
    if (c.action === "map_dark") return 7;
    if (c.action === "plunder_reverse") return 11;
    if (c.action === "plunder_double") return 7;
    if (c.action === "trade_break") return 8;
    if (c.action === "trade_protect") return 5;
    if (c.action === "plunder") return c.range === "higher" && !o.players.some(q => q.id !== p.id && q.stage > p.stage) ? 2 : 6;
    if (c.action === "trade") return 5;
    if (c.action === "drawOpportunity") return 6;
    if (c.action === "teleport") return 22;
    if (c.action === "drawRegular") return 10;
    return c.type === "immediate" ? -5 : 4;
  }
  function playerValue(o, p) {
    if (p.escaped) return p.withdrawn ? -3000 : 3000;
    const cost = E.warpCost(p), missing = need(o, p), usefulPower = Math.min(p.power, (missing + (p.stage < 3 ? 1.4 : .4)) * cost);
    let v = (p.stage - 1) * 112 + p.warp * 20 + usefulPower * .82 + Math.max(0, p.power - usefulPower) * .18 + energyValue(p.energy);
    v += equipment(p).reduce((sum, id) => sum + equipValue(o, p, id), 0);
    v -= (p.skipSchedule || []).filter(x => x.round > o.round).length * 21;
    if (p.stage === 3 && !missing) v += 48 - distance(p, "s3_eye") * 3.2;
    else if (p.power >= Math.max(cost, cost * missing)) v += 15 - distance(p, `s${p.stage}_warp`) * 1.5;
    if (p.fortressProtected) v += 4;
    return v;
  }
  function utility(o) {
    return o.players.reduce((sum, p) => sum + playerValue(o, p) * (p.id === o.aiId ? 1 : -.82), 0);
  }
  function resource(o, p, energy, power) {
    const before = p.energy;
    p.energy = Math.max(0, Math.min(10, p.energy + energy));
    p.power = Math.max(0, p.power + power + (power > 0 && has(p, "supercharge") ? 5 : 0));
    if (before > 0 && p.energy === 0) p.skipSchedule.push({ round: o.round + 1, source: "预估耗尽" });
  }
  function warpEstimate(o, p) {
    const max = Math.floor(p.power / E.warpCost(p)), missing = need(o, p);
    if (!max && missing) return false;
    const buy = Math.min(max, missing);
    p.power -= buy * E.warpCost(p); p.warp += buy;
    if (p.stage < 3 && p.warp >= requirement(o, p)) {
      p.warp -= requirement(o, p); p.stage++;
      let best = null, bestV = -Infinity;
      for (const id of E.universe(p.stage).stationIds) {
        const test = copy(p); test.position = id;
        const landing = node(p.stage, id);
        resource(o, test, landing.energy || 0, landing.power || 0);
        const v = playerValue(o, test) + (landing.extraRegular || 0) * 4 + (landing.extraOpportunity || 0) * 5;
        if (v > bestV) { best = test; bestV = v; }
      }
      Object.assign(p, best); return true;
    }
    return false;
  }
  function landingEstimate(o, p, n, context = {}, depth = 0) {
    if (!n || depth > 2) return 0;
    if (context.bright && context.dark) return n.noRegularDraw ? 0 : 3;
    let positive = 2 ** (context.bright || 0);
    if (has(p, "delisted")) positive *= 2;
    if (has(p, "reclusive")) positive *= 2;
    const convert = v => v > 0 ? (context.dark ? 0 : v * positive) : (context.bright ? 0 : v * 2 ** (context.dark || 0));
    resource(o, p, convert(n.energy || 0), convert(n.power || 0));
    if (n.stagnation && !context.bright) for (let i = 0; i < n.stagnation * 2 ** (context.dark || 0); i++) p.skipSchedule.push({ round: o.round + 1 + i, source: "预估停滞" });
    let extra = n.noRegularDraw ? 0 : 3.8;
    extra += (n.extraRegular || 0) * 4 + (n.extraOpportunity || 0) * 5 + (n.kind === "unknown" ? 5 : 0);
    if (n.fortress) { resource(o, p, 0, convert(10)); p.fortressProtected = true; }
    if (n.chaos) { resource(o, p, (convert(2) + convert(-2)) / 2, (convert(15) + convert(-15)) / 2); extra -= 3; }
    if (n.kind === "tunnel") { resource(o, p, (convert(1) + convert(-2)) / 2, convert(15)); extra -= 2; }
    if (n.discardEquipment) {
      const slot = Object.keys(p.equipment).filter(s => p.equipment[s]).sort((a, b) => equipValue(o, p, p.equipment[a]) - equipValue(o, p, p.equipment[b]))[0];
      if (slot) p.equipment[slot] = null;
    }
    if (n.discardEquipmentReward) extra += Math.max(0, 30 - Math.min(99, ...equipment(p).filter(Boolean).map(id => equipValue(o, p, id))));
    if (n.discardHandReward && (p.handCount || p.hand?.length)) extra += Math.max(0, 9 - Math.min(9, ...(p.hand || []).map(id => handValue(o, p, id))));
    if (n.forcedBack) for (let i = 0; i < n.forcedBack; i++) p.position = E.universe(p.stage).nodes.find(x => x.next.length === 1 && x.next[0] === p.position)?.id || p.position;
    if (n.forcedForward) p.position = E.__debug.buildMovementPath(p, n.forcedForward).at(-1);
    if (n.kind === "warp") warpEstimate(o, p);
    if (n.kind === "eye" && p.warp >= E.requiredEscapeWarp(o)) p.escaped = true;
    if (n.kind === "wormhole" && n.pair && !has(p, "wormhole_probe")) {
      if (n.oneWayEye && p.warp >= E.requiredEscapeWarp(o)) p.escaped = true;
      p.position = n.pair;
    }
    return extra;
  }
  function movementEstimate(o, p, steps, route, trigger = true) {
    p.routePreference = route;
    const path = E.__debug.buildMovementPath(p, steps);
    if (!path.length) return 0;
    let extra = 0;
    p.fortressProtected = false;
    for (let i = 0; i < path.length; i++) {
      const n = node(p.stage, path[i]);
      if (n.kind === "warp" && (i < path.length - 1 || !trigger)) {
        p.position = n.id;
        if (warpEstimate(o, p)) return extra;
      }
      if (i < path.length - 1 && ((has(p, "dyson_sphere") && n.starRegion) || (has(p, "space_probe") && n.kind === "eye"))) {
        const factor = (has(p, "delisted") ? 2 : 1) * (has(p, "reclusive") ? 2 : 1);
        resource(o, p, Math.max(0, n.energy || 0) * factor, Math.max(0, n.power || 0) * factor); extra += 8;
      }
    }
    p.position = path.at(-1);
    if (trigger) extra += landingEstimate(o, p, node(p.stage, p.position));
    return extra;
  }
  function futureValue(o, p) {
    if (p.escaped) return 0;
    const before = playerValue(o, p);
    // Six evenly distributed dice pairs; no live PRNG or deck access.
    const pairs = [[1, 2], [1, 5], [2, 6], [3, 4], [3, 5], [4, 6]];
    let total = 0;
    for (const dice of pairs) {
      let best = -Infinity;
      const bases = [...new Set(dice.concat(has(p, "time_stack") ? [dice[0] + dice[1]] : []))];
      for (const base of bases) for (const bonus of has(p, "supernav") ? [0, 1, 2] : [0]) for (const route of routes(p)) {
        const next = copy(p), bonusValue = movementEstimate(o, next, base + bonus, route);
        best = Math.max(best, playerValue(o, next) - before + bonusValue);
      }
      total += Math.max(-45, Math.min(55, best));
    }
    return total / pairs.length * .30;
  }
  function movementScore(o, targetId, steps, route, trigger = true) {
    const simulation = copy(o), p = player(simulation, targetId), before = utility(simulation);
    const extra = movementEstimate(simulation, p, steps, route, trigger);
    const sign = targetId === o.aiId ? 1 : -.82;
    return utility(simulation) - before + sign * (extra + futureValue(simulation, p) - futureValue(o, player(o, targetId)));
  }
  function rootEstimate(o, action) {
    const sim = copy(o), p = player(sim, action.actorId), before = utility(o);
    if (!p || action.cancelled) return 0;
    const c = card(action.cardId), params = action.params || {}, context = action.context || {};
    let extra = 0;
    if (action.kind === "map") {
      const target = player(sim, action.playerId || action.actorId);
      extra += landingEstimate(sim, target, node(action.stage, action.nodeId), context) * (target.id === o.aiId ? 1 : -.82);
    } else if (action.kind === "plunder" || action.kind === "trade") {
      const state = rulesState(sim);
      try { if (action.kind === "plunder") E.__debug.executePlunder(state, copy(action)); else E.__debug.executeTrade(state, copy(action)); }
      catch (_) { return -100; }
      sim.players = state.players;
    } else if (action.kind === "equipment") {
      p.equipment[c.slot] = c.id;
    } else if (action.kind === "annihilate_equipment") {
      const target = player(sim, params.targetId); if (target) target.equipment[params.slot] = null;
    } else if (action.kind === "equipment_trigger") {
      if (p.equipment.mobility === action.equipmentCardId) {
        const n = node(action.stage, action.nodeId), factor = (has(p, "reclusive") ? 2 : 1) * (has(p, "delisted") ? 2 : 1);
        resource(sim, p, Math.max(0, n.energy || 0) * factor, Math.max(0, n.power || 0) * factor);
        extra += (p.id === o.aiId ? 1 : -.82) * 8;
      }
    } else if (c?.action === "moveSelf") {
      return movementScore(o, p.id, params.steps + (params.navBonus || 0), params.routePreference || p.routePreference, false);
    } else if (c?.action === "moveOther") {
      const target = player(o, params.targetId);
      // The moved player chooses navigation and branch, so do not assume cooperation.
      const scores = routes(target).flatMap(route => (has(target, "supernav") ? [0, 1, 2] : [0]).map(nav => movementScore(o, target.id, params.steps + nav, route)));
      return target.id === o.aiId ? Math.max(...scores) : Math.min(...scores);
    } else if (c?.action === "teleport") {
      const scores = E.universe(p.stage).nodes.map(n => {
        const s = copy(o), q = player(s, p.id); q.position = n.id;
        const draw = landingEstimate(s, q, n);
        return utility(s) - before + (q.id === o.aiId ? 1 : -.82) * draw;
      });
      return p.id === o.aiId ? Math.max(...scores) : Math.min(...scores);
    } else if (c?.action === "drawOpportunity") extra += (p.id === o.aiId ? 1 : -.82) * 12;
    else if (c?.action === "drawRegular") extra += (p.id === o.aiId ? 1 : -.82) * 5 * (c.amount || 1);
    else if (c?.action === "judge_regular_1_9") resource(sim, p, 0, -5.2);
    else if (c?.action === "judge_flower") extra -= (p.id === o.aiId ? 1 : -.82) * 1.2;
    return utility(sim) - before + extra;
  }
  function responseOutcome(o, appended) {
    const sim = copy(o), response = sim.response, before = utility(sim);
    if (appended) response.stack.push(appended);
    const a = response.root;
    for (let i = response.stack.length - 1; i >= 1; i--) {
      const item = response.stack[i]; if (item.cancelled) continue;
      if (item.action === "annihilate") {
        const t = item.annihilationTarget || { type: "stack", index: item.targetIndex };
        if (t.type === "stack" && response.stack[t.index]) response.stack[t.index].cancelled = true;
        else if (t.type === "equipment") {
          const p = player(sim, t.playerId); if (p && p.equipment[t.slot] === t.cardId) p.equipment[t.slot] = null;
        }
      } else if (item.action === "map_bright") a.context.bright = (a.context.bright || 0) + 1;
      else if (item.action === "map_dark") a.context.dark = (a.context.dark || 0) + 1;
      else if (item.action === "plunder_double") a.context.double = (a.context.double || 0) + 1;
      else if (item.action === "plunder_reverse") a.context.reversed = !a.context.reversed;
      else if (item.action === "trade_break" && !a.context.protected) a.context.broken = true;
      else if (item.action === "trade_protect") a.context.protected = true;
    }
    a.cancelled = a.cancelled || response.stack[0].cancelled;
    return utility(sim) - before + rootEstimate(sim, a);
  }
  function rankActions(observation) {
    const o = copy(observation), p = me(o);
    if (!p || o.actorId !== o.aiId || p.escaped || o.phase === "game_over") return [];
    const result = [], state = rulesState(o);
    function add(type, fields, score, reason) {
      result.push({ id: `a${result.length}`, type, actorId: o.aiId, ...fields, score: Math.round((Number.isFinite(score) ? score : -9999) * 100) / 100, reason });
    }
    const moveReason = (steps, route) => `移动${steps}格；比较落点资源、能源耗尽、装备经过收益，以及距跃迁点/宇宙之眼的距离，预看下一轮6组骰面${p.stage === 3 ? `；${route === "long" ? "长" : "短"}支路` : ""}`;
    if (o.phase === "roll") add("roll", {}, 0, "公开掷出本轮公共骰");
    if (o.phase === "choose" && !o.ownChoice) {
      for (const choice of E.allowedChoices(state, p.id)) for (const route of routes(p)) add("choose", { choiceKey: choice.key, route, steps: choice.value }, movementScore(o, p.id, choice.value, route), moveReason(choice.value, route));
    }
    if (o.phase === "warp") {
      const offer = o.warpOffer;
      if (offer?.playerId === p.id) for (let count = 0; count <= offer.max; count++) {
        const transition = p.stage < 3 && p.warp + count >= requirement(o, p);
        for (const stationId of transition ? offer.stationIds : [null]) {
          const s = copy(o), q = me(s), before = playerValue(s, q);
          q.power -= count * offer.cost; q.warp += count;
          let extra = 0;
          if (transition) { q.warp -= requirement(s, q); q.stage++; q.position = stationId; extra = landingEstimate(s, q, node(q.stage, stationId)); }
          const score = playerValue(s, q) - before + extra + futureValue(s, q) - futureValue(o, p) - Math.max(0, q.warp - requirement(s, q)) * 8;
          add("warp", { count, stationId }, score, transition ? `购买${count}曲速并跨入第${q.stage}宇宙，选择${node(q.stage, stationId).name}` : `购买${count}曲速；当前缺${need(o, p)}，保留后续动力余量`);
        }
      }
    }
    if (o.phase === "response") {
      const baseline = responseOutcome(o);
      add("pass", {}, 0, "保留瞬发牌：当前收益未超过手牌的后续反制价值");
      for (const id of [...new Set(E.availableResponses(state))]) {
        const c = card(id), targets = c.action === "annihilate" ? E.responseTargets(state) : [null];
        for (const t of targets) {
          const item = { playerId: p.id, cardId: id, action: c.action, cancelled: false };
          if (t) item.annihilationTarget = t.targetType === "stack" ? { type: "stack", index: t.index } : { type: "equipment", playerId: t.playerId, slot: t.slot, cardId: t.cardId };
          const swing = responseOutcome(o, item) - baseline, cost = handValue(o, p, id);
          add("respond", { cardId: id, target: t?.key || null }, swing - cost, `【${c.name}】${t ? `针对${t.targetType === "stack" ? "响应链" : "装备"}【${card(t.cardId)?.name || "效果"}】；` : "；"}逆序模拟整条响应链，改善约${swing.toFixed(1)}分，保留价值${cost.toFixed(1)}分`);
        }
      }
    }
    if (o.phase === "personal") {
      if (o.mustDiscard) for (const id of [...new Set(p.hand)]) add("discard", { cardId: id }, -handValue(o, p, id), `弃置当前未来价值较低的【${card(id).name}】`);
      else {
        add("end", {}, 0, "暂不消耗有后续价值的手牌，结束个人回合");
        for (const slot of Object.keys(p.equipment)) if (p.equipment[slot]) add("unequip", { slot }, -equipValue(o, p, p.equipment[slot]) - .5, `卸下【${card(p.equipment[slot]).name}】，解除其约束`);
        for (const id of [...new Set(p.hand)]) {
          const c = card(id); let paramsList = [{}];
          if (c.type === "immediate") continue;
          if (c.type === "instant") {
            if (c.action !== "annihilate") continue;
            paramsList = o.players.flatMap(q => Object.keys(q.equipment).filter(slot => q.equipment[slot]).map(slot => ({ targetId: q.id, slot })));
          } else if (c.requiresNode) paramsList = D.universes.flatMap(u => u.nodes.map(n => ({ nodeId: n.id })));
          else if (c.requiresTarget) paramsList = E.validTargets(state, id, p.id).map(targetId => ({ targetId }));
          if (c.action === "moveSelf" || c.action === "moveOther") {
            paramsList = paramsList.flatMap(params => Array.from({ length: c.maxSteps - c.minSteps + 1 }, (_, i) => ({ ...params, steps: c.minSteps + i })));
            if (c.action === "moveSelf") paramsList = paramsList.flatMap(params => routes(p).flatMap(routePreference => (has(p, "supernav") ? [0, 1, 2] : [0]).map(navBonus => ({ ...params, routePreference, navBonus }))));
          }
          for (const params of paramsList) {
            if (!E.canPlayCard(state, id, params)) continue;
            let kind = c.type === "equipment" ? "equipment" : c.type === "instant" ? "annihilate_equipment" : ["trade", "plunder"].includes(c.action) ? c.action : "card";
            const transformed = c.action === "trade" && has(p, "force_take"); if (transformed) kind = "plunder";
            const benefit = rootEstimate(o, { kind, actorId: p.id, cardId: id, action: c.action, params, context: {}, transformed });
            const cost = c.type === "equipment" ? 1.3 : handValue(o, p, id) * (p.hand.length > 3 ? .48 : .78);
            add("play", { cardId: id, params }, benefit - cost, `打出【${c.name}】${params.targetId ? `，目标${player(o, params.targetId)?.name}` : ""}${params.steps ? `，前进${params.steps}格` : ""}；局势收益${benefit.toFixed(1)}，用牌成本${cost.toFixed(1)}`);
          }
        }
      }
    }
    if (o.phase === "decision" && o.decision) {
      const d = o.decision;
      if (d.kind === "radar_choice") {
        const available = d.entries.filter(x => !d.picked.includes(x.key) && !d.returnOrder.includes(x.key));
        for (const entry of available) add("decision", { value: `${d.stage === "pick" ? "pick" : "order"}:${entry.key}` }, handValue(o, p, entry.cardId) * (d.stage === "pick" ? 1 : -1), d.stage === "pick" ? `雷达选取当前更有价值的【${card(entry.cardId).name}】` : `把较低价值的【${card(entry.cardId).name}】放回牌堆顶，降低对手先摸到好牌的收益`);
      } else if (d.kind === "immediate_order") {
        for (const item of d.items.filter(x => !d.ordered.includes(x.token))) {
          const c = card(item.cardId);
          add("decision", { value: `immediate:${item.token}` }, c.action === "drawRegular" ? 30 : c.action === "teleport" ? 20 : c.action === "judge_regular_1_9" ? 5 : 0, `先结算【${c.name}】；优先补充可响应手牌，再处理传送和负面判定`);
        }
      } else if (d.kind === "teleport") {
        for (const id of d.nodeIds) { const s = copy(o), q = me(s); q.position = id; const extra = landingEstimate(s, q, node(q.stage, id)); add("decision", { value: id }, utility(s) - utility(o) + extra + futureValue(s, q), `传送到【${node(p.stage, id).name}】，比较资源、跨阶与逃离机会`); }
      } else if (d.kind === "controlled_movement") {
        for (const nav of d.allowedNav) for (const route of d.routes) add("decision", { value: `${nav}|${route}` }, movementScore(o, p.id, d.steps + nav, route), moveReason(d.steps + nav, route));
      } else if (d.kind === "discard_equipment_required") {
        for (const slot of d.slots) add("decision", { value: slot }, -equipValue(o, p, p.equipment[slot]), `舍弃当前价值较低的【${card(p.equipment[slot]).name}】`);
      } else if (d.kind === "discard_hand_reward" || d.kind === "discard_equipment_reward") {
        add("decision", { value: "skip" }, 0, "保留手牌/装备，不换取本次回收收益");
        const factor = (has(p, "delisted") ? 2 : 1) * (has(p, "reclusive") ? 2 : 1) * 2 ** (d.action?.context?.bright || 0);
        const s = copy(o), q = me(s); resource(s, q, (d.reward.energy || 0) * factor, (d.reward.power || 0) * factor);
        const gain = utility(s) - utility(o);
        const values = d.kind === "discard_hand_reward" ? [...new Set(p.hand)] : d.slots;
        for (const value of values) add("decision", { value }, gain - (d.kind === "discard_hand_reward" ? handValue(o, p, value) : equipValue(o, p, p.equipment[value])), `回收低价值${d.kind === "discard_hand_reward" ? "手牌" : "装备"}换取能源与动力，预估资源收益${gain.toFixed(1)}`);
      } else if (d.kind === "wormhole_probe") {
        const n = node(p.stage, d.nodeId), s = copy(o), q = me(s); q.position = n.pair || p.position;
        if (n.oneWayEye && q.warp >= E.requiredEscapeWarp(o)) q.escaped = true;
        add("decision", { value: "native" }, utility(s) - utility(o) + futureValue(s, q), "保留原生虫洞传送，检查经过宇宙之眼的逃离条件");
        for (let steps = 1; steps <= 6; steps++) add("decision", { value: String(steps) }, movementScore(o, p.id, steps, p.routePreference), `虫洞窥探改为前进${steps}格，比较目的格收益`);
      }
    }
    return result.sort((a, b) => b.score - a.score || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  }
  function chooseAction(state, aiId = "player_2") { return rankActions(buildObservation(state, aiId))[0] || null; }
  function applyAction(state, action) {
    if (!action) throw new Error("AI 没有可执行行动。");
    const actor = action.actorId;
    if (state.phase !== "choose" && getActor(state) !== actor) throw new Error("行动所属玩家已经变化，请重新决策。");
    switch (action.type) {
      case "roll": return E.rollDice(state);
      case "choose": E.setRoutePreference(state, actor, action.route); return E.chooseMovement(state, actor, action.choiceKey);
      case "warp": return E.decideWarpPurchase(state, action.count, action.stationId);
      case "respond": return E.playResponse(state, action.cardId, action.target);
      case "pass": return E.passResponse(state);
      case "play": return E.playCard(state, action.cardId, action.params || {});
      case "discard": return E.discardCard(state, action.cardId);
      case "unequip": return E.unequipEquipment(state, action.slot);
      case "end": return E.endPersonalTurn(state);
      case "decision": return E.resolveDecision(state, action.value);
      default: throw new Error(`未知 AI 行动：${action.type}`);
    }
  }
  const AI = { version: "1.0.0", buildObservation, rankActions, chooseAction, applyAction, getActor };
  root.EscapeStarSeaAI = AI;
  if (typeof module !== "undefined" && module.exports) module.exports = AI;
})(typeof globalThis !== "undefined" ? globalThis : this);
