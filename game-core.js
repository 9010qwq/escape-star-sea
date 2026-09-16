(function attachEscapeStarSeaEngine(root) {
  const DATA = root.EscapeStarSeaData || (typeof require === "function" ? require("./game-data.js") : null);
  if (!DATA) throw new Error("EscapeStarSeaData is required before game-core.js");

  const COLORS = ["#78d6ff", "#ffb45e", "#be95ff", "#72e6ad", "#ff7fa6", "#f3df70"];
  const PHASES = Object.freeze({
    ROLL: "roll", CHOOSE: "choose", WARP: "warp", RESPONSE: "response",
    DECISION: "decision", PERSONAL: "personal", GAME_OVER: "game_over",
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const allCards = () => DATA.regularCards.concat(DATA.opportunityCards);
  const cardById = (id) => allCards().find((card) => card.id === id);
  const universe = (stage) => DATA.universes[stage - 1];
  const nodeById = (stage, id) => universe(stage).nodes.find((node) => node.id === id);
  const nodeLocation = (id) => {
    for (let stage = 1; stage <= DATA.universes.length; stage += 1) {
      const node = nodeById(stage, id);
      if (node) return { stage, node };
    }
    return null;
  };
  const playerById = (state, id) => {
    const player = state.players.find((item) => item.id === id);
    if (!player) throw new Error(`Unknown player: ${id}`);
    return player;
  };
  const hasEquipment = (player, id) => Object.values(player.equipment).includes(id);
  const isFortressProtected = (player) => Boolean(player && !player.escaped && player.fortressProtected);

  function nextRandom(state) {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  }

  function randomInt(state, min, max) {
    return min + Math.floor(nextRandom(state) * (max - min + 1));
  }

  function shuffle(state, list) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(nextRandom(state) * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function buildDeck(definitions) {
    return definitions.flatMap((card) => Array.from({ length: card.copies }, () => card.id));
  }

  function addLog(state, message, tone = "neutral", visibility = {}) {
    state.log.unshift({ id: state.nextEventId++, round: state.round, message, tone, ...visibility });
    state.log = state.log.slice(0, 180);
  }

  function orderedPlayerIds(state, filter = () => true) {
    const result = [];
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const player = state.players[(state.rollerIndex + offset) % state.players.length];
      if (filter(player)) result.push(player.id);
    }
    return result;
  }

  function activeRoundPlayers(state) {
    return orderedPlayerIds(state, (player) => !player.escaped && player.activeThisRound);
  }

  function responsePlayers(state, actorId) {
    const alive = state.players.filter((player) => !player.escaped);
    if (!alive.length) return [];
    const actorIndex = state.players.findIndex((player) => player.id === actorId);
    const result = [];
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const player = state.players[(Math.max(0, actorIndex) + offset) % state.players.length];
      if (!player.escaped) result.push(player.id);
    }
    return result;
  }

  function discardPileFor(cardId) {
    return DATA.opportunityCards.some((card) => card.id === cardId) ? "opportunityDiscard" : "regularDiscard";
  }

  function discardCardId(state, cardId) {
    if (cardId) state[discardPileFor(cardId)].push(cardId);
  }

  function scheduleSkip(state, player, source, duration = 1) {
    const firstPossibleRound = state.round + 1;
    const requiredDuration = Math.max(1, Math.floor(Number(duration) || 1));
    player.skipSchedule = player.skipSchedule || [];
    player.recoverySchedule = player.recoverySchedule || [];
    const pending = player.skipSchedule.filter((item) => item.round >= firstPossibleRound);
    const occupied = new Set(pending.map((item) => item.round));
    const addedRounds = [];
    if (state.skipMode === "loose") {
      let candidate = firstPossibleRound;
      while (occupied.size < Math.max(pending.length, requiredDuration)) {
        while (occupied.has(candidate)) candidate += 1;
        player.skipSchedule.push({ round: candidate, source });
        occupied.add(candidate);
        addedRounds.push(candidate);
      }
      if (source === "能源耗尽") {
        player.exhausted = true;
        const recoveryRound = Math.min(...occupied) + 1;
        if (!player.recoverySchedule.some((item) => item.round === recoveryRound)) {
          player.recoverySchedule.push({ round: recoveryRound, energy: 5 });
          player.recoverySchedule.sort((a, b) => a.round - b.round);
        }
      }
      player.skipSchedule.sort((a, b) => a.round - b.round);
      if (addedRounds.length) addLog(state, `${player.name} 获得【${source}${requiredDuration > 1 ? ` ${requiredDuration}轮` : ""}】：宽松模式下将跳过第${addedRounds.join("、")}轮。`, "negative");
      else addLog(state, `${player.name} 已有不少于${requiredDuration}轮待跳过状态，【${source}】不再增加轮数（宽松规则）。`);
      return Math.min(...occupied);
    }
    for (let index = 0; index < requiredDuration; index += 1) {
      let skipRound = firstPossibleRound;
      while (occupied.has(skipRound)) skipRound += 1;
      occupied.add(skipRound);
      addedRounds.push(skipRound);
      player.skipSchedule.push({ round: skipRound, source });
    }
    player.skipSchedule.sort((a, b) => a.round - b.round);
    if (source === "能源耗尽") {
      player.exhausted = true;
      player.recoverySchedule.push({ round: addedRounds[0] + 1, energy: 5 });
      player.recoverySchedule.sort((a, b) => a.round - b.round);
    }
    addLog(state, `${player.name} 获得【${source}${requiredDuration > 1 ? ` ${requiredDuration}轮` : ""}】：严格模式下将跳过第${addedRounds.join("、")}轮。`, "negative");
    return addedRounds[0];
  }

  function applyResources(state, player, energyDelta = 0, powerDelta = 0, source = "效果") {
    const beforeEnergy = player.energy;
    const beforePower = player.power;
    player.energy = Math.max(0, Math.min(10, player.energy + energyDelta));
    player.power = Math.max(0, player.power + powerDelta);
    const gainedPower = player.power > beforePower;
    if (gainedPower && hasEquipment(player, "supercharge")) {
      player.power += 5;
      addLog(state, `${player.name} 的【超级快充】额外提供5动力。`, "positive");
    }
    const actualEnergy = player.energy - beforeEnergy;
    const actualPower = player.power - beforePower;
    if (actualEnergy || actualPower) {
      const bits = [];
      if (actualEnergy) bits.push(`能源${actualEnergy > 0 ? "+" : ""}${actualEnergy}`);
      if (actualPower) bits.push(`动力${actualPower > 0 ? "+" : ""}${actualPower}`);
      addLog(state, `${player.name}：${bits.join("，")}（${source}）`, actualEnergy < 0 || actualPower < 0 ? "negative" : "positive");
    }
    const firstExhaustion = beforeEnergy > 0 && player.energy === 0 && !player.exhausted;
    const strictExtraExhaustion = state.skipMode === "strict" && energyDelta < 0 && player.energy === 0 && (beforeEnergy === 0 || player.exhausted);
    if (firstExhaustion || strictExtraExhaustion) scheduleSkip(state, player, "能源耗尽");
    return { energy: actualEnergy, power: actualPower };
  }

  function recycleDeckIfNeeded(state, kind) {
    const deckKey = `${kind}Deck`;
    const discardKey = `${kind}Discard`;
    if (!state[deckKey].length && state[discardKey].length) {
      state[deckKey] = shuffle(state, state[discardKey]);
      state[discardKey] = [];
      addLog(state, `${kind === "regular" ? "常规" : "机遇"}弃牌堆已洗回牌堆。`);
    }
  }

  function takeTop(state, kind) {
    recycleDeckIfNeeded(state, kind);
    return state[`${kind}Deck`].pop() || null;
  }

  function cardScore(card) {
    if (!card) return 0;
    if (card.type === "equipment") return 5;
    if (card.type === "instant") return 4;
    if (card.action === "drawOpportunity" || card.action === "drawRegular") return 3;
    return 2;
  }

  function ensureTransientQueues(state) {
    state.drawChoiceQueue = state.drawChoiceQueue || [];
    state.drawChoiceContinuation = state.drawChoiceContinuation || null;
    state.passingQueue = state.passingQueue || [];
    state.passingContinuation = state.passingContinuation || null;
    state.nextImmediateId = Number(state.nextImmediateId || 1);
  }

  function drawChoiceEntries(visible) {
    return visible.map((cardId, index) => ({ key: `${index}:${cardId}`, cardId }));
  }

  function addRegularCardsToHand(state, player, cardIds, source = "摸取") {
    player.hand.push(...cardIds);
    addLog(state, `${player.name} ${source}${cardIds.length}张常规牌。`);
  }

  function queueOpportunityCard(state, player, cardId) {
    const card = cardById(cardId);
    if (card.type === "immediate") {
      ensureTransientQueues(state);
      state.immediateQueue.push({
        playerId: player.id,
        cardId,
        token: `immediate_${state.nextImmediateId++}`,
        orderLocked: false,
      });
      addLog(state, `${player.name} 公开机遇牌【${card.name}】：${card.description}`, "accent");
    } else {
      player.hand.push(cardId);
      addLog(state, `${player.name} 获得机遇装备【${card.name}】。`, "accent", { privateTo: player.id, publicMessage: `${player.name} 获得1张机遇装备。` });
    }
  }

  function drawRegular(state, player, count = 1) {
    if (count <= 0) return;
    ensureTransientQueues(state);
    const visible = [];
    const viewCount = hasEquipment(player, "wide_radar") ? Math.max(3, count) : count;
    for (let i = 0; i < viewCount; i += 1) {
      const id = takeTop(state, "regular");
      if (id) visible.push(id);
    }
    if (!visible.length) return;
    if (hasEquipment(player, "wide_radar") && visible.length > count) {
      state.drawChoiceQueue.push({
        kind: "regular",
        playerId: player.id,
        count: Math.min(count, visible.length),
        entries: drawChoiceEntries(visible),
        equipmentName: "广域巡天雷达",
      });
      addLog(state, `${player.name} 的【广域巡天雷达】查看${visible.length}张，等待本人选取并安排牌堆顶顺序。`, "accent");
      return;
    }
    addRegularCardsToHand(state, player, visible.slice(0, count));
  }

  function revealRegular(state) {
    const id = takeTop(state, "regular");
    if (id) state.regularDiscard.push(id);
    return id ? cardById(id) : null;
  }

  function collectOpportunity(state, player, count = 1) {
    if (count <= 0) return;
    ensureTransientQueues(state);
    const visible = [];
    const viewCount = hasEquipment(player, "deep_radar") ? Math.max(2, count) : count;
    for (let i = 0; i < viewCount; i += 1) {
      const id = takeTop(state, "opportunity");
      if (id) visible.push(id);
    }
    if (hasEquipment(player, "deep_radar") && visible.length > count) {
      state.drawChoiceQueue.push({
        kind: "opportunity",
        playerId: player.id,
        count: Math.min(count, visible.length),
        entries: drawChoiceEntries(visible),
        equipmentName: "深空扫描雷达",
      });
      addLog(state, `${player.name} 的【深空扫描雷达】查看${visible.length}张，等待本人选取并安排牌堆顶顺序。`, "accent");
      return;
    }
    visible.slice(0, count).forEach((id) => queueOpportunityCard(state, player, id));
  }

  function processDrawChoices(state, continuation = null) {
    ensureTransientQueues(state);
    if (continuation) state.drawChoiceContinuation = continuation;
    if (state.drawChoiceQueue.length) {
      const task = state.drawChoiceQueue[0];
      state.decision = {
        kind: "radar_choice",
        playerId: task.playerId,
        drawKind: task.kind,
        equipmentName: task.equipmentName,
        count: task.count,
        entries: clone(task.entries),
        stage: "pick",
        picked: [],
        returnOrder: [],
      };
      state.phase = PHASES.DECISION;
      return;
    }
    const next = state.drawChoiceContinuation;
    state.drawChoiceContinuation = null;
    if (!next) return;
    if (next.kind === "after_passing_trigger") {
      processNextPassingTrigger(state);
    } else if (next.kind === "after_unified_draw") {
      addLog(state, "统一摸牌完成；立即结算牌按玩家确认的顺序处理。", "accent");
      beginImmediateOrdering(state, "enterPersonal");
    } else if (next.kind === "after_map_draw") {
      if (next.afterImmediate) state.afterImmediate = next.afterImmediate;
      beginImmediateOrdering(state);
    } else if (next.kind === "after_immediate_draw") {
      processImmediateQueue(state);
    } else if (next.kind === "after_personal_opportunity") {
      beginImmediateOrdering(state, "personal");
    }
  }

  function nextImmediateOrderGroup(state) {
    const seen = [];
    state.immediateQueue.forEach((item) => {
      if (!item.orderLocked && !seen.includes(item.playerId)) seen.push(item.playerId);
    });
    for (const playerId of seen) {
      const items = state.immediateQueue.filter((item) => item.playerId === playerId && !item.orderLocked);
      if (items.length > 1) return { playerId, items };
    }
    return null;
  }

  function beginImmediateOrdering(state, afterImmediate = undefined) {
    ensureTransientQueues(state);
    if (afterImmediate !== undefined) state.afterImmediate = afterImmediate;
    const group = nextImmediateOrderGroup(state);
    if (!group) {
      state.immediateQueue.forEach((item) => { item.orderLocked = true; });
      processImmediateQueue(state);
      return;
    }
    state.decision = {
      kind: "immediate_order",
      playerId: group.playerId,
      items: group.items.map((item) => ({ token: item.token, cardId: item.cardId })),
      ordered: [],
    };
    state.phase = PHASES.DECISION;
    addLog(state, `${playerById(state, group.playerId).name} 同时获得多张立即牌，等待本人决定结算顺序。`, "accent");
  }

  function prepareRound(state) {
    state.players.forEach((player) => {
      if (player.escaped) {
        player.activeThisRound = false;
        return;
      }
      player.skipSchedule = player.skipSchedule || [];
      player.recoverySchedule = player.recoverySchedule || [];
      const recoveries = player.recoverySchedule.filter((item) => item.round === state.round);
      if (recoveries.length) {
        player.energy = Math.max(player.energy, 5);
        player.recoverySchedule = player.recoverySchedule.filter((item) => item.round > state.round);
        player.exhausted = player.recoverySchedule.length > 0;
        addLog(state, `${player.name} 从能源耗尽中恢复至5能源。`, "positive");
      }
      const currentSkips = player.skipSchedule.filter((item) => item.round === state.round);
      player.skipSchedule = player.skipSchedule.filter((item) => item.round > state.round);
      player.activeThisRound = currentSkips.length === 0;
      if (currentSkips.length) {
        addLog(state, `${player.name} 因【${currentSkips.map((item) => item.source).join("＋")}】跳过本轮移动、落点、摸牌与个人回合，但仍可瞬发响应。`, "negative");
      }
    });
    if (!activeRoundPlayers(state).length && state.players.some((player) => !player.escaped)) finishRound(state);
  }

  function startStationSetup(state, player) {
    const node = nodeById(player.stage, player.position);
    applyResources(state, player, node.energy || 0, node.power || 0, node.name);
    drawRegular(state, player, 2 + (node.extraRegular || 0));
    if (node.extraOpportunity) collectOpportunity(state, player, node.extraOpportunity);
    addLog(state, `${player.name} 从${node.name}出发：能源${player.energy}、动力${player.power}、起手${player.hand.length}张。`);
  }

  function createGame(options = {}) {
    const playerCount = Math.max(2, Math.min(6, Number(options.playerCount) || 3));
    const mode = ["experience", "quick", "immersive"].includes(options.mode) ? options.mode : "quick";
    const seedValue = Number(options.seed);
    const state = {
      version: DATA.version,
      seed: Number.isFinite(seedValue) ? seedValue >>> 0 : 20260823,
      mode,
      skipMode: options.skipMode === "strict" ? "strict" : "loose",
      privacyMode: options.privacyMode !== false,
      round: 1, rollerIndex: 0, phase: PHASES.ROLL, dice: [], choices: {},
      movementPlans: {}, warpQueue: [], warpIndex: 0, warpContext: null,
      personalOrder: [], personalIndex: 0, mustDiscard: false,
      response: null, decision: null, sharedFlow: null,
      immediateQueue: [], nextImmediateId: 1, afterImmediate: null, placements: [],
      drawChoiceQueue: [], drawChoiceContinuation: null,
      passingQueue: [], passingContinuation: null,
      nextEventId: 1, log: [],
      regularDeck: [], regularDiscard: [], opportunityDeck: [], opportunityDiscard: [],
      players: Array.from({ length: playerCount }, (_, index) => {
        const requestedStart = options.startStations && options.startStations[index];
        const start = universe(1).stationIds.includes(requestedStart) ? requestedStart : universe(1).stationIds[index % universe(1).stationIds.length];
        return {
          id: `player_${index + 1}`,
          name: options.names && options.names[index] ? String(options.names[index]).slice(0, 16) : `玩家${index + 1}`,
          color: COLORS[index], stage: 1, position: start,
          energy: 10, power: 0, warp: 0, hand: [],
          equipment: { plunder: null, trade: null, mobility: null },
          routePreference: index % 2 ? "long" : "short",
          activeThisRound: true, skipSchedule: [], recoverySchedule: [],
          exhausted: false, escaped: false, withdrawn: false, escapedRound: null, fortressProtected: false,
        };
      }),
    };
    state.regularDeck = shuffle(state, buildDeck(DATA.regularCards));
    state.opportunityDeck = shuffle(state, buildDeck(DATA.opportunityCards));
    state.players.forEach((player) => startStationSetup(state, player));
    processImmediateQueue(state);
    prepareRound(state);
    addLog(state, `${state.players[state.rollerIndex].name} 成为第1轮掷骰玩家。`, "accent");
    return state;
  }

  function requiredStageWarp(state, stage = 1) {
    const currentStage = typeof stage === "object" ? stage.stage : Number(stage) || 1;
    if (state.mode === "experience") return 1;
    if (state.mode === "immersive") return currentStage <= 1 ? 2 : 3;
    return currentStage <= 1 ? 1 : 2;
  }
  function requiredEscapeWarp(state) { return state.mode === "experience" ? 2 : state.mode === "immersive" ? 4 : 3; }
  function warpCost(player) { return hasEquipment(player, "warp_discount") ? 25 : 30; }

  function nextNodeId(player, currentId) {
    const node = nodeById(player.stage, currentId);
    if (!node || !node.next.length) throw new Error("地图路线不完整。");
    if (node.next.length === 1) return node.next[0];
    return player.routePreference === "long" ? node.next.find((id) => id === "s3_primordial") : node.next.find((id) => id === "s3_station_d");
  }

  function buildMovementPath(player, steps) {
    const path = [];
    let current = player.position;
    for (let index = 0; index < steps; index += 1) {
      current = nextNodeId(player, current);
      path.push(current);
    }
    return path;
  }

  function previousNodeId(stage, currentId) {
    const previous = universe(stage).nodes.find((node) => node.next.length === 1 && node.next[0] === currentId);
    return previous ? previous.id : currentId;
  }

  function allowedChoices(state, playerId) {
    if (state.phase !== PHASES.CHOOSE) return [];
    const player = playerById(state, playerId);
    if (!player.activeThisRound || player.escaped) return [];
    const bases = [{ key: "die_0", label: `骰A · ${state.dice[0]}`, value: state.dice[0] }];
    if (state.dice[1] !== state.dice[0]) bases.push({ key: "die_1", label: `骰B · ${state.dice[1]}`, value: state.dice[1] });
    if (hasEquipment(player, "time_stack")) bases.push({ key: "sum", label: `时序叠加 · ${state.dice[0] + state.dice[1]}`, value: state.dice[0] + state.dice[1] });
    if (!hasEquipment(player, "supernav")) return bases;
    return bases.flatMap((choice) => [0, 1, 2].map((bonus) => ({
      key: `${choice.key}_n${bonus}`, label: `${choice.label}${bonus ? ` +导航${bonus}` : ""}`,
      value: choice.value + bonus, baseKey: choice.key, navBonus: bonus,
    })));
  }

  function setRoutePreference(state, playerId, route) {
    const player = playerById(state, playerId);
    if (!["short", "long"].includes(route)) throw new Error("支路选择不合法。");
    player.routePreference = route;
    addLog(state, `${player.name} 将第三宇宙分岔预设为${route === "short" ? "短支路" : "宇宙之眼长支路"}。`);
  }

  function rollDice(state) {
    if (state.phase !== PHASES.ROLL) throw new Error("当前阶段不能掷公共骰。");
    state.dice = [randomInt(state, 1, 6), randomInt(state, 1, 6)];
    state.choices = {};
    state.phase = PHASES.CHOOSE;
    addLog(state, `${state.players[state.rollerIndex].name} 掷出 ${state.dice[0]} 和 ${state.dice[1]}。`, "accent");
    return state.dice.slice();
  }

  function chooseMovement(state, playerId, choiceKey) {
    const choice = allowedChoices(state, playerId).find((item) => item.key === choiceKey);
    if (!choice) throw new Error("该移动选择不合法。");
    state.choices[playerId] = clone(choice);
    addLog(state, `${playerById(state, playerId).name} 公开选择移动${choice.value}格。`);
  }

  function allPlayersChosen(state) { return activeRoundPlayers(state).every((id) => state.choices[id]); }

  function previewMovement(state, playerId, choiceKey = null) {
    const player = playerById(state, playerId);
    const choice = choiceKey
      ? allowedChoices(state, playerId).find((item) => item.key === choiceKey)
      : state.choices[playerId];
    if (!choice) return null;
    const nodeIds = buildMovementPath(player, choice.value);
    const warpIndex = nodeIds.findIndex((id) => nodeById(player.stage, id).kind === "warp");
    return {
      value: choice.value,
      nodeIds,
      names: nodeIds.map((id) => nodeById(player.stage, id).name),
      finalId: nodeIds[nodeIds.length - 1],
      finalName: nodeById(player.stage, nodeIds[nodeIds.length - 1]).name,
      warpIndex,
    };
  }

  function passingTriggersFor(state, player, nodeIds) {
    const triggers = [];
    nodeIds.forEach((id) => {
      const node = nodeById(player.stage, id);
      if (node.starRegion && hasEquipment(player, "dyson_sphere")) {
        triggers.push({ playerId: player.id, stage: player.stage, nodeId: id, equipmentCardId: "dyson_sphere", triggerKind: "dyson" });
      }
      if (node.kind === "eye" && hasEquipment(player, "space_probe")) {
        triggers.push({ playerId: player.id, stage: player.stage, nodeId: id, equipmentCardId: "space_probe", triggerKind: "probe" });
      }
    });
    return triggers;
  }

  function beginPassingSequence(state, triggers, continuation) {
    ensureTransientQueues(state);
    state.passingQueue = clone(triggers || []);
    state.passingContinuation = continuation || null;
    processNextPassingTrigger(state);
  }

  function processNextPassingTrigger(state) {
    ensureTransientQueues(state);
    while (state.passingQueue.length) {
      const trigger = state.passingQueue.shift();
      const player = playerById(state, trigger.playerId);
      if (!player || player.escaped || player.equipment.mobility !== trigger.equipmentCardId) continue;
      const node = nodeById(trigger.stage, trigger.nodeId);
      const equipment = cardById(trigger.equipmentCardId);
      beginResponse(state, {
        kind: "equipment_trigger",
        actorId: player.id,
        playerId: player.id,
        cardId: null,
        equipmentCardId: trigger.equipmentCardId,
        triggerKind: trigger.triggerKind,
        stage: trigger.stage,
        nodeId: trigger.nodeId,
        name: `${equipment.name}经过${node.name}`,
        context: {},
      });
      return;
    }
    const continuation = state.passingContinuation;
    state.passingContinuation = null;
    if (!continuation) return;
    if (continuation.kind === "shared_plans_ready") {
      if (state.warpQueue.length) {
        state.warpContext = "shared";
        state.phase = PHASES.WARP;
      } else commitSharedMovement(state);
    } else if (continuation.kind === "single_plan_ready") {
      continueSinglePlanAfterPassing(state, continuation.plan);
    } else if (continuation.kind === "warp_decision_ready") {
      finishWarpStep(state, continuation.completedContext, continuation.plan);
    }
  }

  function makeMovementPlan(state, player, steps, flowKind) {
    const path = buildMovementPath(player, steps);
    const warpIndex = path.findIndex((id) => nodeById(player.stage, id).kind === "warp");
    const passingNodeIds = warpIndex >= 0 ? path.slice(0, warpIndex) : path.slice(0, -1);
    const plan = {
      playerId: player.id, from: player.position, stage: player.stage, steps, path,
      final: path[path.length - 1], warpIndex, transition: false, stationId: null, flowKind,
      passingTriggers: passingTriggersFor(state, player, passingNodeIds),
    };
    return plan;
  }

  function makeWarpOffer(state, plan) {
    const player = playerById(state, plan.playerId);
    const cost = warpCost(player);
    return { playerId: player.id, plan, cost, max: Math.floor(player.power / cost), stationIds: player.stage < 3 ? universe(player.stage + 1).stationIds.slice() : [] };
  }

  function executeSharedMovement(state) {
    if (state.phase !== PHASES.CHOOSE || !allPlayersChosen(state)) throw new Error("所有可行动玩家完成选择后才能同步移动。");
    state.movementPlans = {};
    state.warpQueue = [];
    state.warpIndex = 0;
    const passingTriggers = [];
    activeRoundPlayers(state).forEach((id) => {
      const player = playerById(state, id);
      const plan = makeMovementPlan(state, player, state.choices[id].value, "shared");
      state.movementPlans[id] = plan;
      passingTriggers.push(...plan.passingTriggers);
      if (plan.warpIndex >= 0 && plan.warpIndex < plan.path.length - 1) state.warpQueue.push(makeWarpOffer(state, plan));
    });
    addLog(state, "所有可行动玩家的完整路径与最终格已同时确定，先处理沿途装备触发与跃迁点。", "accent");
    beginPassingSequence(state, passingTriggers, { kind: "shared_plans_ready" });
  }

  function currentWarpOffer(state) {
    const offer = state.phase === PHASES.WARP ? state.warpQueue[state.warpIndex] || null : null;
    if (!offer) return null;
    // 路径在经过效果之前排队；购买能力必须在抵达时读取，不能沿用出发时的快照。
    const player = playerById(state, offer.playerId);
    offer.cost = warpCost(player);
    offer.max = Math.floor(player.power / offer.cost);
    return offer;
  }

  function decideWarpPurchase(state, count, stationId = null) {
    const offer = currentWarpOffer(state);
    if (!offer) throw new Error("当前没有待处理的曲速购买。");
    const player = playerById(state, offer.playerId);
    const amount = Math.max(0, Math.min(offer.max, Math.floor(Number(count) || 0)));
    // JSON存档不会保留对象引用；共享移动时始终修改movementPlans里的权威计划。
    const plan = state.warpContext === "shared" && state.movementPlans[offer.playerId]
      ? state.movementPlans[offer.playerId]
      : offer.plan;
    const stageRequirement = requiredStageWarp(state, player.stage);
    const willTransition = player.stage < 3 && player.warp + amount >= stageRequirement;
    if (willTransition && !offer.stationIds.includes(stationId)) throw new Error("跨阶时请选择合法驿站。");
    player.power -= amount * offer.cost;
    player.warp += amount;
    if (amount) addLog(state, `${player.name} 支付${amount * offer.cost}动力购买${amount}曲速。`, "positive");
    else addLog(state, `${player.name} 本次${state.warpContext === "landing" ? "抵达" : "经过"}跃迁点但不购买曲速。`);

    if (willTransition) {
      player.warp -= stageRequirement;
      plan.transition = true;
      plan.stationId = stationId;
      plan.final = stationId;
      addLog(state, `${player.name} 支付本阶曲速并进入${universe(player.stage + 1).name}。`, "positive");
    }

    state.warpIndex += 1;
    const completedContext = state.warpContext;
    const remainingTriggers = willTransition ? [] : passingTriggersFor(state, player, plan.path.slice(plan.warpIndex + 1, -1));
    beginPassingSequence(state, remainingTriggers, { kind: "warp_decision_ready", completedContext, plan });
  }

  function finishWarpStep(state, completedContext, plan) {
    if (state.warpIndex < state.warpQueue.length) {
      state.phase = PHASES.WARP;
      return;
    }
    state.warpQueue = [];
    state.warpIndex = 0;
    state.warpContext = null;
    const player = playerById(state, plan.playerId);
    if (completedContext === "landing") {
      const action = plan.afterMapAction;
      const sourceNode = nodeById(action.stage, action.nodeId);
      if (plan.transition) {
        player.fortressProtected = false;
        player.stage += 1;
        player.position = plan.stationId;
        beginMapResolution(state, player, nodeById(player.stage, player.position), action.flowKind, false, "transition", action.completionCardId);
      } else afterMapEffect(state, action, sourceNode);
    } else if (completedContext === "shared") commitSharedMovement(state);
    else finalizeSingleMovement(state, plan);
  }

  function commitSharedMovement(state) {
    activeRoundPlayers(state).forEach((id) => {
      const player = playerById(state, id);
      const plan = state.movementPlans[id];
      player.fortressProtected = false;
      if (plan.transition) {
        player.stage += 1;
        player.position = plan.stationId;
      } else player.position = plan.final;
    });
    state.sharedFlow = { queue: activeRoundPlayers(state), index: 0, pendingDraws: {} };
    state.phase = PHASES.CHOOSE;
    processNextSharedLanding(state);
  }

  function beginMapResolution(state, player, node, flowKind, suppressBaseDraw = false, trigger = "landing", completionCardId = null) {
    player.fortressProtected = false;
    const rootAction = {
      kind: "map", actorId: player.id, playerId: player.id, nodeId: node.id, stage: player.stage,
      flowKind, suppressBaseDraw, trigger, completionCardId, context: { bright: 0, dark: 0 },
    };
    addLog(state, `${player.name} 触发【${node.name}】：${node.description}`, node.kind === "hazard" ? "negative" : "accent");
    beginResponse(state, rootAction);
  }

  function processNextSharedLanding(state) {
    const flow = state.sharedFlow;
    if (!flow) return;
    if (flow.index >= flow.queue.length) {
      resolveUnifiedDraw(state);
      return;
    }
    const player = playerById(state, flow.queue[flow.index]);
    const plan = state.movementPlans[player.id];
    const node = nodeById(player.stage, player.position);
    beginMapResolution(state, player, node, "shared", false, plan.transition ? "transition" : "landing");
  }

  function mapResourceDeltas(player, node, context) {
    const brightCount = Number(context.bright || 0);
    const darkCount = Number(context.dark || 0);
    if (brightCount > 0 && darkCount > 0) return { energy: 0, power: 0, neutralized: true };
    let positiveFactor = 1;
    positiveFactor *= 2 ** brightCount;
    if (hasEquipment(player, "delisted")) positiveFactor *= 2;
    if (hasEquipment(player, "reclusive")) positiveFactor *= 2;
    const negativeFactor = 2 ** darkCount;
    const convert = (value) => {
      if (!value) return 0;
      if (value > 0) return context.dark ? 0 : value * positiveFactor;
      return context.bright ? 0 : value * negativeFactor;
    };
    return { energy: convert(node.energy || 0), power: convert(node.power || 0), neutralized: false };
  }

  function queueMapDecision(state, decision) {
    state.decision = decision;
    state.phase = PHASES.DECISION;
  }

  function resolveMapEffect(state, action) {
    const player = playerById(state, action.playerId);
    const node = nodeById(action.stage, action.nodeId);
    const deltas = mapResourceDeltas(player, node, action.context);
    if (deltas.neutralized) {
      addLog(state, `明暗法则同时作用：${node.name}本次全部地图效果失效，仅保留摸牌。`, "accent");
      afterMapEffect(state, action, node);
      return;
    }

    const negativeAllowed = !action.context.bright;
    if (node.stagnation && negativeAllowed) scheduleSkip(state, player, "停滞", node.stagnation * (2 ** Number(action.context.dark || 0)));
    applyResources(state, player, deltas.energy, deltas.power, node.name);

    if (node.fortress) {
      player.fortressProtected = true;
      const roll = randomInt(state, 1, 6);
      addLog(state, `${player.name} 的星际堡垒独立判定骰为${roll}。`, "accent");
      if (roll >= 5) {
        const reward = mapResourceDeltas(player, { power: 30 }, action.context);
        applyResources(state, player, reward.energy, reward.power, "星际堡垒判定成功");
      }
    }
    if (node.chaos) {
      const roll = randomInt(state, 1, 6);
      addLog(state, `${player.name} 的混沌乱流独立判定骰为${roll}。`, "accent");
      const branch = roll % 2 ? { energy: 2, power: -15 } : { energy: -2, power: 15 };
      const pseudo = mapResourceDeltas(player, branch, action.context);
      applyResources(state, player, pseudo.energy, pseudo.power, "混沌乱流判定");
    }
    if (node.kind === "tunnel") {
      const roll = randomInt(state, 1, 6);
      addLog(state, `${player.name} 的奇异隧道独立判定骰为${roll}。`, "accent");
      if (roll % 2) {
        const reward = mapResourceDeltas(player, { energy: 1 }, action.context);
        applyResources(state, player, reward.energy, reward.power, "奇异隧道奇数");
        player.position = node.pair;
        addLog(state, `${player.name} 经奇异隧道传送至【${nodeById(player.stage, node.pair).name}】。`, "accent");
      } else if (!(roll % 2)) {
        const pseudo = mapResourceDeltas(player, { energy: -2, power: 30 }, action.context);
        applyResources(state, player, pseudo.energy, pseudo.power, "奇异隧道偶数");
      }
    }
    if (node.forcedBack) {
      for (let i = 0; i < node.forcedBack; i += 1) player.position = previousNodeId(player.stage, player.position);
      addLog(state, `${player.name} 被强制后退至【${nodeById(player.stage, player.position).name}】，不结算新位置。`, "negative");
    }
    if (node.forcedForward) {
      const forcedPath = buildMovementPath(player, node.forcedForward);
      player.position = forcedPath[forcedPath.length - 1];
      addLog(state, `${player.name} 被强制前进至【${nodeById(player.stage, player.position).name}】，不结算新位置。`, "negative");
    }

    if (node.discardEquipment) {
      const slots = Object.keys(player.equipment).filter((slot) => player.equipment[slot]);
      if (slots.length) {
        queueMapDecision(state, { kind: "discard_equipment_required", playerId: player.id, slots, action, nodeId: node.id });
        return;
      }
    }
    if (node.discardHandReward && player.hand.length) {
      queueMapDecision(state, { kind: "discard_hand_reward", playerId: player.id, cards: player.hand.slice(), reward: node.discardHandReward, action, nodeId: node.id });
      return;
    }
    if (node.discardEquipmentReward) {
      const slots = Object.keys(player.equipment).filter((slot) => player.equipment[slot]);
      if (slots.length) {
        queueMapDecision(state, { kind: "discard_equipment_reward", playerId: player.id, slots, reward: node.discardEquipmentReward, action, nodeId: node.id });
        return;
      }
    }

    if (node.kind === "wormhole" && node.pair && action.trigger !== "wormhole_exit") {
      if (hasEquipment(player, "wormhole_probe") && action.trigger !== "wormhole_probe") {
        queueMapDecision(state, { kind: "wormhole_probe", playerId: player.id, action, nodeId: node.id });
        return;
      }
      applyNativeWormhole(state, player, node, action);
    }

    if (node.kind === "warp") {
      const plan = {
        playerId: player.id, from: player.position, stage: player.stage, steps: 0,
        path: [node.id], final: node.id, warpIndex: 0, transition: false, stationId: null,
        flowKind: action.flowKind, suppressBaseDraw: action.suppressBaseDraw, trigger: action.trigger,
        sourceCardId: action.completionCardId, afterMapAction: action,
      };
      state.warpQueue = [makeWarpOffer(state, plan)];
      state.warpIndex = 0;
      state.warpContext = "landing";
      state.phase = PHASES.WARP;
      return;
    }

    if (node.kind === "eye") checkEscape(state, player, "准确停留宇宙之眼");
    afterMapEffect(state, action, node);
  }

  function applyNativeWormhole(state, player, node, action) {
    if (node.oneWayEye) {
      const eye = nodeById(3, "s3_eye");
      const pseudo = mapResourceDeltas(player, eye, action.context);
      applyResources(state, player, pseudo.energy, pseudo.power, "右下虫洞途经宇宙之眼");
      checkEscape(state, player, "右下虫洞原生单向连接");
      if (!player.escaped) {
        player.position = node.pair;
        addLog(state, `${player.name} 经单向虫洞途经宇宙之眼后抵达左上出口。`, "accent");
      }
    } else if (node.id === "s2_worm_r" || node.id === "s2_worm_l") {
      player.position = node.pair;
      addLog(state, `${player.name} 经双向虫洞传送至【${nodeById(player.stage, node.pair).name}】。`, "accent");
    }
  }

  function drawPlanForNode(node, suppressBaseDraw, trigger = "landing", neutralized = false) {
    if (neutralized) {
      if (node.kind === "unknown") return { regular: 1, opportunity: 1 };
      return { regular: suppressBaseDraw ? 0 : 2, opportunity: 0 };
    }
    if (node.noRegularDraw && !neutralized) return { regular: 0, opportunity: 0 };
    if (node.kind === "unknown") return { regular: 1, opportunity: 1 };
    return { regular: (suppressBaseDraw ? 0 : 2) + (node.extraRegular || 0), opportunity: node.extraOpportunity || 0 };
  }

  function afterMapEffect(state, action, node) {
    const player = playerById(state, action.playerId);
    if (player.escaped) {
      if (action.completionCardId) discardCardId(state, action.completionCardId);
      if (action.flowKind === "shared") {
        state.sharedFlow.index += 1;
        processNextSharedLanding(state);
      } else if (action.flowKind === "immediate") processImmediateQueue(state);
      else resumePersonalPhase(state);
      return;
    }
    const neutralized = Number(action.context?.bright || 0) > 0 && Number(action.context?.dark || 0) > 0;
    const drawPlan = drawPlanForNode(node, action.suppressBaseDraw, action.trigger, neutralized);
    if (action.flowKind === "shared") {
      state.sharedFlow.pendingDraws[player.id] = drawPlan;
      state.sharedFlow.index += 1;
      processNextSharedLanding(state);
    } else {
      collectOpportunity(state, player, drawPlan.opportunity);
      drawRegular(state, player, drawPlan.regular);
      if (action.completionCardId) discardCardId(state, action.completionCardId);
      processDrawChoices(state, { kind: "after_map_draw", afterImmediate: action.flowKind !== "immediate" ? "personal" : null });
    }
  }

  function resolveUnifiedDraw(state) {
    const flow = state.sharedFlow;
    flow.queue.forEach((id) => {
      const player = playerById(state, id);
      if (player.escaped) return;
      const plan = flow.pendingDraws[id] || { regular: 0, opportunity: 0 };
      collectOpportunity(state, player, plan.opportunity);
      drawRegular(state, player, plan.regular);
    });
    processDrawChoices(state, { kind: "after_unified_draw" });
  }

  function processImmediateQueue(state) {
    while (state.immediateQueue.length) {
      const item = state.immediateQueue.shift();
      const player = playerById(state, item.playerId);
      if (player.escaped) {
        discardCardId(state, item.cardId);
        continue;
      }
      const card = cardById(item.cardId);
      beginResponse(state, {
        kind: "immediate",
        actorId: player.id,
        cardId: item.cardId,
        action: card.action,
        params: {},
        context: {},
        alreadyDiscarded: false,
      });
      return;
    }
    const after = state.afterImmediate;
    state.afterImmediate = null;
    if (after === "enterPersonal") enterPersonalPhase(state);
    else if (after === "immediate") processImmediateQueue(state);
    else if (after === "personal") resumePersonalPhase(state);
  }

  function resolveImmediateAction(state, rootAction) {
    const player = playerById(state, rootAction.actorId);
    const card = cardById(rootAction.cardId);
    if (card.action === "drawRegular") {
      drawRegular(state, player, card.amount);
      discardCardId(state, rootAction.cardId);
      processDrawChoices(state, { kind: "after_immediate_draw" });
      return;
    }
    if (card.action === "judge_regular_1_9" || card.action === "judge_flower") {
      const judged = revealRegular(state);
      if (judged) {
        addLog(state, `${player.name} 用【${judged.face}·${judged.name}】完成${card.name}判定。`, "accent");
        const numberHit = /^[一九]/.test(judged.face);
        const flowerHit = ["春", "夏", "秋", "冬", "梅", "兰", "竹", "菊"].includes(judged.face);
        if (card.action === "judge_regular_1_9" && numberHit) applyResources(state, player, 0, -20, "时空禁制");
        if (card.action === "judge_flower" && flowerHit) scheduleSkip(state, player, "停滞");
      }
      discardCardId(state, rootAction.cardId);
      processImmediateQueue(state);
      return;
    }
    if (card.action === "teleport") {
      state.decision = { kind: "teleport", playerId: player.id, nodeIds: universe(player.stage).nodes.map((node) => node.id), completionCardId: rootAction.cardId };
      state.phase = PHASES.DECISION;
      return;
    }
    discardCardId(state, rootAction.cardId);
    processImmediateQueue(state);
  }

  function checkEscape(state, player, trigger) {
    if (player.stage !== 3 || player.warp < requiredEscapeWarp(state) || player.escaped) {
      if (player.stage === 3) addLog(state, `${player.name} 触发宇宙之眼，但还需${Math.max(0, requiredEscapeWarp(state) - player.warp)}曲速才能逃离。`);
      return false;
    }
    player.warp -= requiredEscapeWarp(state);
    player.escaped = true;
    player.escapedRound = state.round;
    const sameRound = state.placements.find((place) => place.round === state.round);
    if (sameRound) sameRound.playerIds.push(player.id);
    else state.placements.push({ rank: state.placements.reduce((sum, place) => sum + place.playerIds.length, 0) + 1, round: state.round, playerIds: [player.id] });
    player.hand.forEach((id) => discardCardId(state, id));
    Object.values(player.equipment).filter(Boolean).forEach((id) => discardCardId(state, id));
    player.hand = [];
    player.equipment = { plunder: null, trade: null, mobility: null };
    player.energy = 0;
    player.power = 0;
    player.warp = 0;
    player.position = null;
    player.fortressProtected = false;
    addLog(state, `${player.name} 通过“${trigger}”支付${requiredEscapeWarp(state)}曲速，成功逃离星海！`, "positive");
    return true;
  }

  function withdrawPlayer(state, playerId) {
    const player = playerById(state, playerId);
    if (player.escaped) throw new Error("该玩家已经离开本局。");
    const current = currentPersonalPlayer(state);
    const responder = currentResponder(state);
    const safeCheckpoint = state.phase === PHASES.ROLL
      || state.phase === PHASES.CHOOSE
      || (state.phase === PHASES.PERSONAL && current && current.id === player.id)
      || (state.phase === PHASES.RESPONSE && responder && responder.id === player.id);
    if (!safeCheckpoint) throw new Error("请在公开掷骰、全员选点、该玩家个人回合，或该玩家响应机会中退出本局。");
    const phaseAtExit = state.phase;
    player.hand.forEach((id) => discardCardId(state, id));
    Object.values(player.equipment).filter(Boolean).forEach((id) => discardCardId(state, id));
    player.hand = [];
    player.equipment = { plunder: null, trade: null, mobility: null };
    player.energy = 0;
    player.power = 0;
    player.warp = 0;
    player.position = null;
    player.fortressProtected = false;
    player.activeThisRound = false;
    player.skipSchedule = [];
    player.recoverySchedule = [];
    player.exhausted = false;
    player.withdrawn = true;
    player.escaped = true;
    addLog(state, `${player.name} 主动退出本局，不计入逃离排名。`, "negative");
    if (state.players.every((item) => item.escaped)) {
      if (state.response) {
        state.response.stack.forEach((item, index) => {
          if (item.cardId && !(index === 0 && state.response.root.alreadyDiscarded)) discardCardId(state, item.cardId);
        });
        if (state.response.root.completionCardId) discardCardId(state, state.response.root.completionCardId);
      } else if (state.decision?.completionCardId) discardCardId(state, state.decision.completionCardId);
      else if (state.decision?.action?.completionCardId) discardCardId(state, state.decision.action.completionCardId);
      else if (state.phase === PHASES.WARP) {
        state.warpQueue.forEach((offer) => {
          if (offer.plan?.sourceCardId) discardCardId(state, offer.plan.sourceCardId);
        });
      }
      state.immediateQueue.forEach((item) => discardCardId(state, item.cardId));
      state.response = null;
      state.decision = null;
      state.immediateQueue = [];
      state.afterImmediate = null;
      state.warpQueue = [];
      state.warpIndex = 0;
      state.warpContext = null;
      state.mustDiscard = false;
      state.phase = PHASES.GAME_OVER;
      addLog(state, "本局已无仍在星海中的玩家，游戏结束。", "accent");
      return;
    }
    if (phaseAtExit === PHASES.CHOOSE) delete state.choices[player.id];
    if (phaseAtExit === PHASES.RESPONSE && state.response) {
      if (state.response.root.actorId === player.id) {
        state.response.root.cancelled = true;
        state.response.root.cancelReason = "withdrawn";
        if (state.response.stack[0]) state.response.stack[0].cancelled = true;
        addLog(state, `${player.name} 已退出，本次尚未结算的主动效果取消。`, "negative");
      }
      const removedIndex = state.response.order.indexOf(player.id);
      if (removedIndex >= 0) {
        const wasCurrent = removedIndex === state.response.cursor;
        state.response.order.splice(removedIndex, 1);
        if (!state.response.order.length) {
          resolveResponseStack(state);
        } else {
          if (removedIndex < state.response.cursor) state.response.cursor -= 1;
          else if (wasCurrent) state.response.cursor %= state.response.order.length;
          state.response.passes = Math.min(state.response.passes, state.response.order.length);
          advanceResponsePriority(state);
        }
      }
    } else if (phaseAtExit === PHASES.PERSONAL) {
      finishPersonalTurn(state);
    }
    if (phaseAtExit === PHASES.ROLL && state.players[state.rollerIndex].escaped) {
      do { state.rollerIndex = (state.rollerIndex + 1) % state.players.length; }
      while (state.players[state.rollerIndex].escaped);
      addLog(state, `本轮尚未掷骰，掷骰玩家调整为${state.players[state.rollerIndex].name}。`, "accent");
    }
  }

  function validPlunderTarget(state, actor, target, card) {
    if (!target || target.escaped || target.id === actor.id) return false;
    if (hasEquipment(actor, "reclusive") || hasEquipment(target, "reclusive")) return false;
    if (isFortressProtected(target)) return false;
    if (card.range === "higher" && target.stage <= actor.stage) return false;
    if (card.range === "same" && (target.stage !== actor.stage || target.position !== actor.position)) return false;
    return true;
  }

  function tradeTerms(actor, card) {
    let terms = { payPower: card.payPower || 0, payEnergy: card.payEnergy || 0, gainPower: card.gainPower || 0, gainEnergy: card.gainEnergy || 0 };
    if (card.gainEnergy && hasEquipment(actor, "energy_discount")) terms = { payPower: 5, payEnergy: 0, gainPower: 0, gainEnergy: 5 };
    if (card.gainPower && hasEquipment(actor, "power_discount")) terms = { payPower: 0, payEnergy: 5, gainPower: 50, gainEnergy: 0 };
    return terms;
  }

  function canPayTrade(actor, target, terms) {
    if (actor.power < terms.payPower || actor.energy < terms.payEnergy) return false;
    if (target.id === actor.id) return true;
    if (target.power < terms.gainPower || target.energy < terms.gainEnergy) return false;
    return true;
  }

  function validTargets(state, cardId, actorId) {
    const actor = playerById(state, actorId);
    const card = cardById(cardId);
    if (!card) return [];
    if (card.action === "moveOther") return state.players.filter((p) => {
      if (p.escaped) return false;
      const protectedTarget = p.id !== actor.id && isFortressProtected(p);
      return !protectedTarget;
    }).map((p) => p.id);
    if (card.action === "trade") {
      if (hasEquipment(actor, "force_take")) {
        return state.players.filter((p) => validPlunderTarget(state, actor, p, { range: "higher" })).map((p) => p.id);
      }
      if (hasEquipment(actor, "delisted")) return [];
      return state.players.filter((target) => {
        if (target.escaped || hasEquipment(target, "delisted")) return false;
        if (target.id !== actor.id && isFortressProtected(target)) return false;
        if (target.id === actor.id && !hasEquipment(actor, "self_loop")) return false;
        return canPayTrade(actor, target, tradeTerms(actor, card));
      }).map((p) => p.id);
    }
    if (card.action === "plunder") return state.players.filter((p) => validPlunderTarget(state, actor, p, card)).map((p) => p.id);
    return [];
  }

  function adjacentNodeIds(stage, centerId) {
    const nodes = universe(stage).nodes;
    const center = nodeById(stage, centerId);
    const result = new Set([centerId]);
    const isSpecialConnection = (left, right) => left && right && (left.pair === right.id || right.pair === left.id);
    if (center) {
      center.next.forEach((id) => {
        const target = nodeById(stage, id);
        if (target && !isSpecialConnection(center, target)) result.add(id);
      });
      nodes.forEach((node) => {
        if (node.next.includes(centerId) && !isSpecialConnection(node, center)) result.add(node.id);
      });
    }
    return result;
  }

  function plunderTargetsForRoot(state, root) {
    const actor = playerById(state, root.actorId);
    const card = effectivePlunderCard(root);
    if (card.range === "area") {
      const location = nodeLocation(root.params.nodeId);
      if (!location) return [];
      const area = adjacentNodeIds(location.stage, root.params.nodeId);
      return orderedPlayerIds(state, (p) => p.id !== actor.id && !p.escaped && p.stage === location.stage && area.has(p.position))
        .map((id) => playerById(state, id));
    }
    return [playerById(state, root.params.targetId)];
  }

  function effectivePlunderCard(root) {
    const card = clone(cardById(root.cardId));
    if (root.transformed) {
      card.range = "higher";
      card.power = 30;
      card.energy = 0;
      card.name = "超距掠夺Ⅱ（强取豪夺）";
    }
    return card;
  }

  function executePlunder(state, root) {
    const originalActor = playerById(state, root.actorId);
    const card = effectivePlunderCard(root);
    const targets = plunderTargetsForRoot(state, root);
    let branches = 0;
    targets.forEach((originalTarget) => {
      const attacker = root.context.reversed ? originalTarget : originalActor;
      const defender = root.context.reversed ? originalActor : originalTarget;
      if (!validPlunderTarget(state, attacker, defender, card)) {
        addLog(state, `${attacker.name} → ${defender.name} 的反转后目标检查失败，该分支无效。`);
        return;
      }
      if ((card.range === "same" || card.range === "area") && hasEquipment(defender, "dispersed_array")) {
        addLog(state, `${defender.name} 的【分散阵列】使本次${card.name}无效。`);
        return;
      }
      let power = card.power || 0;
      let energy = card.energy || 0;
      if (hasEquipment(attacker, "power_field")) power += 5;
      if (hasEquipment(defender, "engine_shield")) power = Math.max(0, power - 5);
      if (hasEquipment(attacker, "energy_field")) energy += 2;
      let multiplier = 2 ** Number(root.context.double || 0);
      if (hasEquipment(attacker, "double_plunder")) multiplier *= 2;
      if ((card.range === "any" || card.range === "higher") && hasEquipment(defender, "dispersed_array")) multiplier *= 2;
      power *= multiplier;
      energy *= multiplier;
      const movedPower = Math.min(defender.power, power);
      const movedEnergy = Math.min(defender.energy, energy, 10 - attacker.energy);
      applyResources(state, defender, -movedEnergy, -movedPower, `${card.name}被掠夺`);
      applyResources(state, attacker, movedEnergy, movedPower, card.name);
      addLog(state, `${attacker.name} 从${defender.name}实际转移${movedPower}动力、${movedEnergy}能源。`, "negative");
      branches += 1;
    });
    if (!branches) addLog(state, `【${card.name}】没有产生合法转移。`);
  }

  function executeTrade(state, root) {
    const actor = playerById(state, root.actorId);
    const target = playerById(state, root.params.targetId);
    const card = cardById(root.cardId);
    if (root.context.broken) {
      addLog(state, `【${card.name}】被禁售协议破坏。`, "negative");
      return;
    }
    if (target.id === actor.id && !hasEquipment(actor, "self_loop")) {
      addLog(state, `【${card.name}】结算时已失去【自循环】，自我交易不发生。`, "negative");
      return;
    }
    const terms = tradeTerms(actor, card);
    if (hasEquipment(actor, "delisted") || hasEquipment(target, "delisted") || !canPayTrade(actor, target, terms)) {
      addLog(state, `【${card.name}】结算前复查失败，交易不发生。`, "negative");
      return;
    }
    const multiplier = hasEquipment(actor, "double_trade") ? 2 : 1;
    if (target.id === actor.id) {
      applyResources(state, actor, -terms.payEnergy, -terms.payPower, "自循环支付");
      applyResources(state, actor, terms.gainEnergy * multiplier, terms.gainPower * multiplier, "自循环收益");
    } else {
      applyResources(state, actor, -terms.payEnergy, -terms.payPower, "交易支付");
      applyResources(state, target, terms.payEnergy, terms.payPower, "交易所得");
      applyResources(state, target, -terms.gainEnergy, -terms.gainPower, "交易支付");
      applyResources(state, actor, terms.gainEnergy * multiplier, terms.gainPower * multiplier, "交易所得");
    }
    addLog(state, `${actor.name} 与${target.name}完成【${card.name}】的强制交换${multiplier > 1 ? "，双倍交易追加了使用者收益" : ""}。`, "positive");
  }

  function equipResolved(state, root) {
    const player = playerById(state, root.actorId);
    const card = cardById(root.cardId);
    player.equipment[card.slot] = card.id;
    addLog(state, `${player.name} 装备【${card.name}】。`, "positive");
  }

  function beginSingleMovement(state, player, steps, suppressBaseDraw, flowKind = "personal", trigger = "landing", sourceCardId = null) {
    const plan = makeMovementPlan(state, player, steps, flowKind);
    plan.suppressBaseDraw = suppressBaseDraw;
    plan.trigger = trigger;
    plan.sourceCardId = sourceCardId;
    beginPassingSequence(state, plan.passingTriggers, { kind: "single_plan_ready", plan });
  }

  function continueSinglePlanAfterPassing(state, plan) {
    const treatsFinalWarpAsPassing = plan.trigger === "directed_jump";
    if (plan.warpIndex >= 0 && (plan.warpIndex < plan.path.length - 1 || treatsFinalWarpAsPassing)) {
      state.warpQueue = [makeWarpOffer(state, plan)];
      state.warpIndex = 0;
      state.warpContext = "single";
      state.phase = PHASES.WARP;
    } else finalizeSingleMovement(state, plan);
  }

  function finalizeSingleMovement(state, plan) {
    const player = playerById(state, plan.playerId);
    player.fortressProtected = false;
    if (plan.trigger === "directed_jump") {
      if (plan.transition) {
        player.stage += 1;
        player.position = plan.stationId;
      } else player.position = plan.final;
      addLog(state, `${player.name} 由【定向跃迁】抵达【${nodeById(player.stage, player.position).name}】，按牌面不结算终点格且不摸牌。`, "accent");
      if (plan.sourceCardId) discardCardId(state, plan.sourceCardId);
      resumePersonalPhase(state);
    } else if (plan.transition) {
      player.stage += 1;
      player.position = plan.stationId;
      beginMapResolution(state, player, nodeById(player.stage, player.position), plan.flowKind, false, "transition", plan.sourceCardId);
    } else {
      player.position = plan.final;
      beginMapResolution(state, player, nodeById(player.stage, player.position), plan.flowKind, plan.suppressBaseDraw, plan.trigger || "landing", plan.sourceCardId);
    }
  }

  function resolveRootAction(state, rootAction) {
    const player = playerById(state, rootAction.actorId);
    if (rootAction.kind === "map") {
      if (rootAction.cancelled) {
        const node = nodeById(rootAction.stage, rootAction.nodeId);
        addLog(state, `${player.name} 已退出，【${node.name}】不再结算。`, "negative");
        afterMapEffect(state, rootAction, node);
        return;
      }
      resolveMapEffect(state, rootAction);
      return;
    }
    if (rootAction.kind === "equipment_trigger") {
      const equipmentStillActive = player.equipment.mobility === rootAction.equipmentCardId;
      const node = nodeById(rootAction.stage, rootAction.nodeId);
      if (rootAction.cancelled || !equipmentStillActive) {
        addLog(state, `【${cardById(rootAction.equipmentCardId).name}】已离场，本次经过触发不结算。`, "negative");
        processNextPassingTrigger(state);
        return;
      }
      let factor = 1;
      if (hasEquipment(player, "delisted")) factor *= 2;
      if (hasEquipment(player, "reclusive")) factor *= 2;
      if (rootAction.triggerKind === "dyson") {
        applyResources(state, player, Math.max(0, node.energy || 0) * factor, Math.max(0, node.power || 0) * factor, `戴森球经过${node.name}`);
        drawRegular(state, player, 2);
      } else {
        applyResources(state, player, 2 * factor, 20 * factor, "空间探针经过宇宙之眼");
        drawRegular(state, player, 2);
        addLog(state, `${player.name} 只是“经过”宇宙之眼，本次不检查逃离。`);
      }
      processDrawChoices(state, { kind: "after_passing_trigger" });
      return;
    }
    const shouldDiscard = Boolean(rootAction.cardId && !rootAction.alreadyDiscarded && rootAction.kind !== "equipment");
    if (rootAction.cancelled) {
      if (rootAction.kind === "equipment" && !rootAction.alreadyDiscarded) discardCardId(state, rootAction.cardId);
      else if (shouldDiscard) discardCardId(state, rootAction.cardId);
      const reason = rootAction.cancelReason === "withdrawn" ? "因使用者退出而取消" : "被湮灭";
      addLog(state, `【${cardById(rootAction.cardId).name}】${reason}，效果不结算。`, "negative");
      if (rootAction.kind === "immediate") processImmediateQueue(state);
      else resumePersonalPhase(state);
      return;
    }
    if (rootAction.kind === "equipment") {
      equipResolved(state, rootAction);
      resumePersonalPhase(state);
      return;
    }
    if (rootAction.kind === "immediate") {
      resolveImmediateAction(state, rootAction);
      return;
    }
    if (rootAction.kind === "annihilate_equipment") {
      const target = playerById(state, rootAction.params.targetId);
      const equippedId = target.equipment[rootAction.params.slot];
      if (equippedId) {
        target.equipment[rootAction.params.slot] = null;
        discardCardId(state, equippedId);
        addLog(state, `${player.name} 用【绝对湮灭】弃置${target.name}的【${cardById(equippedId).name}】。`, "negative");
      }
      if (shouldDiscard) discardCardId(state, rootAction.cardId);
      resumePersonalPhase(state);
      return;
    }
    if (rootAction.kind === "plunder") {
      executePlunder(state, rootAction);
      if (shouldDiscard) discardCardId(state, rootAction.cardId);
    } else if (rootAction.kind === "trade") {
      executeTrade(state, rootAction);
      if (shouldDiscard) discardCardId(state, rootAction.cardId);
    } else if (rootAction.action === "drawOpportunity") {
      collectOpportunity(state, player, 1);
      if (shouldDiscard) discardCardId(state, rootAction.cardId);
      processDrawChoices(state, { kind: "after_personal_opportunity" });
      return;
    } else if (rootAction.action === "moveSelf") {
      if (["short", "long"].includes(rootAction.params.routePreference)) player.routePreference = rootAction.params.routePreference;
      const nav = hasEquipment(player, "supernav") ? Math.max(0, Math.min(2, rootAction.params.navBonus || 0)) : 0;
      beginSingleMovement(state, player, rootAction.params.steps + nav, true, "personal", "directed_jump", rootAction.cardId);
      return;
    } else if (rootAction.action === "moveOther") {
      const target = playerById(state, rootAction.params.targetId);
      if (target.escaped) {
        addLog(state, `【${cardById(rootAction.cardId).name}】的移动目标已离开，本次移动不发生。`, "negative");
        if (shouldDiscard) discardCardId(state, rootAction.cardId);
        resumePersonalPhase(state);
        return;
      }
      state.decision = {
        kind: "controlled_movement", playerId: target.id, controllerId: player.id,
        steps: rootAction.params.steps, allowedNav: hasEquipment(target, "supernav") ? [0, 1, 2] : [0],
        routes: target.stage === 3 ? ["short", "long"] : [target.routePreference],
        completionCardId: rootAction.cardId,
      };
      state.phase = PHASES.DECISION;
      addLog(state, `${target.name} 决定本次受控移动的超算加格与第三宇宙分岔。`, "accent");
      return;
    }
    if (shouldDiscard && !["plunder", "trade"].includes(rootAction.kind)) discardCardId(state, rootAction.cardId);
    resumePersonalPhase(state);
  }

  function responseKindAllows(rootKind, action) {
    if (action === "annihilate") return true;
    if (rootKind === "map") return action === "map_bright" || action === "map_dark";
    if (rootKind === "plunder") return action === "plunder_double" || action === "plunder_reverse";
    if (rootKind === "trade") return action === "trade_break" || action === "trade_protect";
    return false;
  }

  function responseTargets(state, responder = currentResponder(state)) {
    if (!state.response) return [];
    const stackTargets = state.response.stack
      .map((item, index) => ({ ...item, index, targetType: "stack", key: `stack:${index}` }))
      .filter((item) => item.cardId && !item.cancelled);
    const equipmentTargets = [];
    state.players.forEach((player) => {
      const protectedTarget = responder && player.id !== responder.id && isFortressProtected(player);
      if (player.escaped || protectedTarget) return;
      Object.entries(player.equipment).forEach(([slot, cardId]) => {
        if (cardId) equipmentTargets.push({
          targetType: "equipment", key: `equipment:${player.id}:${slot}`, playerId: player.id,
          slot, cardId, name: cardById(cardId).name,
        });
      });
    });
    return stackTargets.concat(equipmentTargets);
  }

  function availableResponsesForPlayer(state, player) {
    if (!state.response || !player) return [];
    return player.hand.filter((id) => {
      const card = cardById(id);
      if (card.type !== "instant" || !responseKindAllows(state.response.root.kind, card.action)) return false;
      if (card.action === "annihilate") return responseTargets(state, player).length > 0;
      return true;
    });
  }

  function advanceResponsePriority(state) {
    const response = state.response;
    while (response && response.passes < response.order.length) {
      const player = playerById(state, response.order[response.cursor]);
      if (availableResponsesForPlayer(state, player).length) return;
      response.passes += 1;
      response.cursor = (response.cursor + 1) % response.order.length;
    }
    if (response && response.passes >= response.order.length) resolveResponseStack(state);
  }

  function beginResponse(state, rootAction) {
    const ids = responsePlayers(state, rootAction.actorId);
    const rootName = rootAction.name || (rootAction.kind === "map"
      ? nodeById(rootAction.stage, rootAction.nodeId).name
      : cardById(rootAction.cardId)?.name || "规则效果");
    state.response = {
      root: rootAction,
      stack: [{ playerId: rootAction.actorId, cardId: rootAction.cardId || null, name: rootName, cancelled: false }],
      order: ids, cursor: 0, passes: 0,
    };
    state.phase = PHASES.RESPONSE;
    const hasEligible = ids.some((id) => availableResponsesForPlayer(state, playerById(state, id)).length);
    if (!hasEligible) {
      state.response = null;
      resolveRootAction(state, rootAction);
      return;
    }
    addLog(state, `打开响应窗口：${state.response.stack[0].name}。`, "accent");
    advanceResponsePriority(state);
  }

  function currentResponder(state) {
    if (state.phase !== PHASES.RESPONSE || !state.response) return null;
    return playerById(state, state.response.order[state.response.cursor]);
  }

  function availableResponses(state) {
    const player = currentResponder(state);
    return availableResponsesForPlayer(state, player);
  }

  function playResponse(state, cardId, requestedTarget = null) {
    const player = currentResponder(state);
    if (!player || !availableResponses(state).includes(cardId)) throw new Error("这张瞬发牌不能响应当前事件。");
    player.hand.splice(player.hand.indexOf(cardId), 1);
    const card = cardById(cardId);
    let targetIndex = null;
    let annihilationTarget = null;
    if (card.action === "annihilate") {
      const legalTargets = responseTargets(state);
      const legacyIndex = typeof requestedTarget === "number" || /^\d+$/.test(String(requestedTarget ?? "")) ? Number(requestedTarget) : null;
      const selected = legalTargets.find((item) => item.key === requestedTarget)
        || legalTargets.find((item) => item.targetType === "stack" && item.index === legacyIndex)
        || legalTargets[legalTargets.length - 1];
      if (selected) {
        annihilationTarget = selected.targetType === "stack"
          ? { type: "stack", index: selected.index }
          : { type: "equipment", playerId: selected.playerId, slot: selected.slot, cardId: selected.cardId };
        if (annihilationTarget.type === "stack") targetIndex = annihilationTarget.index;
      }
    }
    state.response.stack.push({ playerId: player.id, cardId, name: card.name, action: card.action, targetIndex, annihilationTarget, cancelled: false });
    state.response.passes = 0;
    state.response.cursor = (state.response.cursor + 1) % state.response.order.length;
    addLog(state, `${player.name} 响应打出【${card.name}】。`, "accent");
    advanceResponsePriority(state);
  }

  function passResponse(state) {
    const player = currentResponder(state);
    if (!player) throw new Error("当前没有响应者。");
    addLog(state, `${player.name} 放弃继续响应。`);
    state.response.passes += 1;
    state.response.cursor = (state.response.cursor + 1) % state.response.order.length;
    advanceResponsePriority(state);
  }

  function resolveResponseStack(state) {
    const response = state.response;
    const rootItem = response.stack[0];
    for (let index = response.stack.length - 1; index >= 1; index -= 1) {
      const item = response.stack[index];
      discardCardId(state, item.cardId);
      if (item.cancelled) {
        addLog(state, `【${item.name}】已被湮灭，不结算。`, "negative");
        continue;
      }
      if (item.action === "annihilate" && (item.annihilationTarget || item.targetIndex !== null)) {
        const target = item.annihilationTarget || { type: "stack", index: item.targetIndex };
        if (target.type === "stack" && response.stack[target.index] && !response.stack[target.index].cancelled) {
          response.stack[target.index].cancelled = true;
          addLog(state, `【绝对湮灭】取消【${response.stack[target.index].name}】。`, "negative");
        } else if (target.type === "equipment") {
          const equipmentOwner = playerById(state, target.playerId);
          if (equipmentOwner.equipment[target.slot] === target.cardId) {
            equipmentOwner.equipment[target.slot] = null;
            discardCardId(state, target.cardId);
            addLog(state, `【绝对湮灭】弃置${equipmentOwner.name}的【${cardById(target.cardId).name}】。`, "negative");
          }
        }
      } else if (item.action === "map_bright") response.root.context.bright = Number(response.root.context.bright || 0) + 1;
      else if (item.action === "map_dark") response.root.context.dark = Number(response.root.context.dark || 0) + 1;
      else if (item.action === "plunder_double") response.root.context.double = Number(response.root.context.double || 0) + 1;
      else if (item.action === "plunder_reverse") response.root.context.reversed = !response.root.context.reversed;
      else if (item.action === "trade_break") {
        if (!response.root.context.protected) response.root.context.broken = true;
      } else if (item.action === "trade_protect") response.root.context.protected = true;
    }
    if (rootItem.cancelled) response.root.cancelled = true;
    state.response = null;
    resolveRootAction(state, response.root);
  }

  function canPlayCard(state, cardId, params = {}) {
    if (state.phase !== PHASES.PERSONAL || state.mustDiscard) return false;
    const actor = currentPersonalPlayer(state);
    if (!actor || !actor.hand.includes(cardId)) return false;
    const card = cardById(cardId);
    if (card.type === "immediate") return false;
    if (card.type === "instant") {
      if (card.action !== "annihilate") return false;
      const target = state.players.find((p) => p.id === params.targetId);
      if (!target || !target.equipment[params.slot]) return false;
      if (target.id !== actor.id && isFortressProtected(target)) return false;
      return true;
    }
    if (card.requiresTarget && !validTargets(state, cardId, actor.id).includes(params.targetId)) return false;
    if (card.requiresNode && !nodeLocation(params.nodeId)) return false;
    if ((card.action === "moveSelf" || card.action === "moveOther") && (params.steps < card.minSteps || params.steps > card.maxSteps)) return false;
    if (params.routePreference && !["short", "long"].includes(params.routePreference)) return false;
    return true;
  }

  function playCard(state, cardId, params = {}) {
    if (!canPlayCard(state, cardId, params)) throw new Error("当前参数下不能打出这张牌。");
    const actor = currentPersonalPlayer(state);
    const card = cardById(cardId);
    actor.hand.splice(actor.hand.indexOf(cardId), 1);

    let rootAction;
    if (card.type === "equipment") {
      const oldId = actor.equipment[card.slot];
      if (oldId) {
        actor.equipment[card.slot] = null;
        discardCardId(state, oldId);
        addLog(state, `${actor.name} 在声明新装备前弃置旧装备【${cardById(oldId).name}】。`);
      }
      rootAction = { kind: "equipment", actorId: actor.id, cardId, params, context: {} };
    } else if (card.type === "instant") {
      rootAction = { kind: "annihilate_equipment", actorId: actor.id, cardId, params, context: {} };
    } else if (card.action === "trade" && hasEquipment(actor, "force_take")) {
      rootAction = { kind: "plunder", actorId: actor.id, cardId, params, context: {}, transformed: true };
      addLog(state, `${actor.name} 的【强取豪夺】把【${card.name}】完整替换为超距掠夺Ⅱ。`, "accent");
    } else {
      const kind = card.action === "plunder" ? "plunder" : card.action === "trade" ? "trade" : "card";
      rootAction = { kind, actorId: actor.id, cardId, action: card.action, params, context: {} };
    }
    addLog(state, `${actor.name} 声明【${card.name}】。`, "accent");
    beginResponse(state, rootAction);
  }

  function currentPersonalPlayer(state) {
    if (![PHASES.PERSONAL, PHASES.RESPONSE, PHASES.DECISION, PHASES.WARP].includes(state.phase)) return null;
    const id = state.personalOrder[state.personalIndex];
    return id ? playerById(state, id) : null;
  }

  function enterPersonalPhase(state) {
    state.personalOrder = activeRoundPlayers(state).filter((id) => !playerById(state, id).escaped);
    state.personalIndex = 0;
    state.mustDiscard = false;
    state.sharedFlow = null;
    if (!state.personalOrder.length) { finishRound(state); return; }
    state.phase = PHASES.PERSONAL;
    addLog(state, `进入个人回合：${currentPersonalPlayer(state).name}先行动。`, "accent");
  }

  function discardCard(state, cardId) {
    if (state.phase !== PHASES.PERSONAL || !state.mustDiscard) throw new Error("当前不需要弃牌。");
    const player = currentPersonalPlayer(state);
    const index = player.hand.indexOf(cardId);
    if (index < 0) throw new Error("手中没有这张牌。");
    player.hand.splice(index, 1);
    discardCardId(state, cardId);
    addLog(state, `${player.name} 弃置【${cardById(cardId).name}】。`);
    if (player.hand.length <= 3) {
      state.mustDiscard = false;
      finishPersonalTurn(state);
    }
  }

  function unequipEquipment(state, slot) {
    if (state.phase !== PHASES.PERSONAL || state.mustDiscard) throw new Error("当前不能主动卸下装备。");
    const player = currentPersonalPlayer(state);
    if (!player || !Object.prototype.hasOwnProperty.call(player.equipment, slot) || !player.equipment[slot]) throw new Error("该装备槽当前为空。");
    const id = player.equipment[slot];
    player.equipment[slot] = null;
    discardCardId(state, id);
    addLog(state, `${player.name} 主动卸下【${cardById(id).name}】并放入弃牌堆。`);
  }

  function endPersonalTurn(state) {
    if (state.phase !== PHASES.PERSONAL) throw new Error("当前不是个人回合。");
    const player = currentPersonalPlayer(state);
    if (player.hand.length > 3) {
      state.mustDiscard = true;
      addLog(state, `${player.name} 手牌超过3张，必须弃至3张。`, "negative");
      return false;
    }
    finishPersonalTurn(state);
    return true;
  }

  function finishPersonalTurn(state) {
    state.personalIndex += 1;
    while (state.personalIndex < state.personalOrder.length && playerById(state, state.personalOrder[state.personalIndex]).escaped) state.personalIndex += 1;
    state.mustDiscard = false;
    if (state.personalIndex < state.personalOrder.length) {
      state.phase = PHASES.PERSONAL;
      addLog(state, `轮到${currentPersonalPlayer(state).name}进行个人回合。`, "accent");
      return;
    }
    finishRound(state);
  }

  function resumePersonalPhase(state) {
    const id = state.personalOrder[state.personalIndex];
    if (id && playerById(state, id).escaped) finishPersonalTurn(state);
    else state.phase = PHASES.PERSONAL;
  }

  function finishRound(state) {
    if (state.players.every((player) => player.escaped)) {
      state.phase = PHASES.GAME_OVER;
      addLog(state, "所有仍在局内的玩家均已逃离，游戏结束。", "positive");
      return;
    }
    state.round += 1;
    let nextIndex = state.rollerIndex;
    do { nextIndex = (nextIndex + 1) % state.players.length; }
    while (state.players[nextIndex].escaped && nextIndex !== state.rollerIndex);
    state.rollerIndex = nextIndex;
    state.phase = PHASES.ROLL;
    state.dice = [];
    state.choices = {};
    state.movementPlans = {};
    state.personalOrder = [];
    state.personalIndex = 0;
    prepareRound(state);
    if (state.phase === PHASES.ROLL) addLog(state, `第${state.round}轮开始，掷骰玩家为${state.players[state.rollerIndex].name}。`, "accent");
  }

  function finalizeRadarChoice(state, decision) {
    const task = state.drawChoiceQueue[0];
    if (!task) throw new Error("雷达选择任务已经不存在。");
    const byKey = new Map(decision.entries.map((entry) => [entry.key, entry]));
    const selectedEntries = decision.picked.map((key) => byKey.get(key)).filter(Boolean);
    const remainingEntries = decision.returnOrder.map((key) => byKey.get(key)).filter(Boolean);
    if (selectedEntries.length !== decision.count || selectedEntries.length + remainingEntries.length !== decision.entries.length) {
      throw new Error("请完成选牌和牌堆顶顺序后再确认。");
    }
    const player = playerById(state, decision.playerId);
    const deck = decision.drawKind === "regular" ? state.regularDeck : state.opportunityDeck;
    remainingEntries.slice().reverse().forEach((entry) => deck.push(entry.cardId));
    if (decision.drawKind === "regular") {
      addRegularCardsToHand(state, player, selectedEntries.map((entry) => entry.cardId), "通过雷达选取");
    } else selectedEntries.forEach((entry) => queueOpportunityCard(state, player, entry.cardId));
    if (remainingEntries.length) {
      addLog(state, `${player.name} 已确定${remainingEntries.length}张未选牌的牌堆顶顺序。`, "accent");
    }
    state.drawChoiceQueue.shift();
    state.decision = null;
    processDrawChoices(state);
  }

  function resolveRadarDecision(state, value) {
    const decision = state.decision;
    if (value === "reset") {
      decision.stage = "pick";
      decision.picked = [];
      decision.returnOrder = [];
      return;
    }
    if (decision.stage === "pick" && String(value).startsWith("pick:")) {
      const key = String(value).slice(5);
      if (!decision.entries.some((entry) => entry.key === key) || decision.picked.includes(key)) throw new Error("雷达选牌目标无效。");
      decision.picked.push(key);
      if (decision.picked.length >= decision.count) {
        const remaining = decision.entries.filter((entry) => !decision.picked.includes(entry.key));
        if (!remaining.length) finalizeRadarChoice(state, decision);
        else decision.stage = "order";
      }
      return;
    }
    if (decision.stage === "order" && String(value).startsWith("order:")) {
      const key = String(value).slice(6);
      const remaining = decision.entries.filter((entry) => !decision.picked.includes(entry.key));
      if (!remaining.some((entry) => entry.key === key) || decision.returnOrder.includes(key)) throw new Error("牌堆顶顺序目标无效。");
      decision.returnOrder.push(key);
      if (decision.returnOrder.length === remaining.length) finalizeRadarChoice(state, decision);
      return;
    }
    throw new Error("当前雷达选择操作无效。");
  }

  function finalizeImmediateOrder(state, decision) {
    const itemByToken = new Map(state.immediateQueue.map((item) => [item.token, item]));
    const orderedItems = decision.ordered.map((token) => itemByToken.get(token)).filter(Boolean);
    if (orderedItems.length !== decision.items.length) throw new Error("请先排完全部立即牌。");
    const positions = [];
    state.immediateQueue.forEach((item, index) => {
      if (item.playerId === decision.playerId && !item.orderLocked) positions.push(index);
    });
    positions.forEach((position, index) => {
      state.immediateQueue[position] = { ...orderedItems[index], orderLocked: true };
    });
    addLog(state, `${playerById(state, decision.playerId).name} 已确认多张立即牌的结算顺序。`, "accent");
    state.decision = null;
    beginImmediateOrdering(state);
  }

  function resolveImmediateOrderDecision(state, value) {
    const decision = state.decision;
    if (value === "reset") {
      decision.ordered = [];
      return;
    }
    if (!String(value).startsWith("immediate:")) throw new Error("当前立即牌排序操作无效。");
    const token = String(value).slice(10);
    if (!decision.items.some((item) => item.token === token) || decision.ordered.includes(token)) throw new Error("立即牌排序目标无效。");
    decision.ordered.push(token);
    if (decision.ordered.length === decision.items.length) finalizeImmediateOrder(state, decision);
  }

  function resolveDecision(state, value) {
    const decision = state.decision;
    if (!decision) throw new Error("当前没有待处理选择。");
    if (decision.kind === "radar_choice") {
      resolveRadarDecision(state, value);
      return;
    }
    if (decision.kind === "immediate_order") {
      resolveImmediateOrderDecision(state, value);
      return;
    }
    state.decision = null;
    const player = playerById(state, decision.playerId);

    if (decision.kind === "teleport") {
      if (!decision.nodeIds.includes(value)) throw new Error("传送目标不合法。");
      const destination = nodeById(player.stage, value);
      addLog(state, `${player.name} 使用【自选跃迁】传送至【${destination.name}】。`, "accent");
      player.position = value;
      beginMapResolution(state, player, destination, "immediate", true, "teleport", decision.completionCardId);
      return;
    }
    if (decision.kind === "controlled_movement") {
      const [navText, route] = String(value).split("|");
      const nav = Number(navText);
      if (!decision.allowedNav.includes(nav)) throw new Error("超算导航选择不合法。");
      if (!decision.routes.includes(route)) throw new Error("第三宇宙分岔选择不合法。");
      player.routePreference = route;
      beginSingleMovement(state, player, decision.steps + nav, true, "personal", "landing", decision.completionCardId);
      return;
    }
    if (decision.kind === "discard_equipment_required") {
      if (!decision.slots.includes(value)) throw new Error("请选择必须弃置的装备。");
      const id = player.equipment[value];
      player.equipment[value] = null;
      discardCardId(state, id);
      addLog(state, `${player.name} 因夸克星弃置【${cardById(id).name}】。`, "negative");
      afterMapEffect(state, decision.action, nodeById(player.stage, decision.nodeId));
      return;
    }
    if (decision.kind === "discard_hand_reward") {
      if (value !== "skip") {
        const index = player.hand.indexOf(value);
        if (index < 0) throw new Error("要弃置的手牌已不存在。");
        player.hand.splice(index, 1);
        discardCardId(state, value);
        const reward = mapResourceDeltas(player, decision.reward, decision.action.context);
        applyResources(state, player, reward.energy, reward.power, "陨落战舰回收");
      } else addLog(state, `${player.name} 放弃陨落战舰的回收奖励。`);
      afterMapEffect(state, decision.action, nodeById(player.stage, decision.nodeId));
      return;
    }
    if (decision.kind === "discard_equipment_reward") {
      if (value !== "skip") {
        if (!decision.slots.includes(value)) throw new Error("装备选择不合法。");
        const id = player.equipment[value];
        player.equipment[value] = null;
        discardCardId(state, id);
        const reward = mapResourceDeltas(player, decision.reward, decision.action.context);
        applyResources(state, player, reward.energy, reward.power, "致密星域回收");
      } else addLog(state, `${player.name} 放弃致密星域的回收奖励。`);
      afterMapEffect(state, decision.action, nodeById(player.stage, decision.nodeId));
      return;
    }
    if (decision.kind === "wormhole_probe") {
      const originalNode = nodeById(player.stage, decision.nodeId);
      if (value === "native") {
        applyNativeWormhole(state, player, originalNode, decision.action);
        afterMapEffect(state, decision.action, originalNode);
        return;
      }
      const steps = Number(value);
      if (steps < 1 || steps > 6) throw new Error("虫洞窥探移动值必须为1—6。");
      addLog(state, `${player.name} 用【虫洞窥探】取消原生传送并改为前进${steps}格。`, "accent");
      beginSingleMovement(state, player, steps, true, decision.action.flowKind, "wormhole_probe", decision.action.completionCardId);
    }
  }

  function getPublicSnapshot(state) {
    return clone({ ...state, players: state.players.map((player) => ({ ...player, hand: player.hand.length })) });
  }

  const Engine = {
    PHASES, createGame, rollDice, allowedChoices, chooseMovement, allPlayersChosen, previewMovement,
    setRoutePreference, executeSharedMovement, currentWarpOffer, decideWarpPurchase,
    currentPersonalPlayer, validTargets, canPlayCard, playCard, discardCard, unequipEquipment, endPersonalTurn, withdrawPlayer,
    currentResponder, availableResponses, responseTargets, playResponse, passResponse, resolveDecision,
    responseStackSnapshot: (state) => state.response ? clone(state.response.stack) : [],
    cardById, nodeById, universe, requiredStageWarp, requiredEscapeWarp, warpCost, isFortressProtected,
    getPublicSnapshot, clone,
    __debug: {
      applyResources, drawRegular, collectOpportunity, buildMovementPath, beginMapResolution,
      checkEscape, scheduleSkip, processImmediateQueue, processDrawChoices, beginImmediateOrdering,
      beginPassingSequence, passingTriggersFor, executePlunder, executeTrade, adjacentNodeIds,
    },
  };

  root.EscapeStarSeaEngine = Engine;
  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
})(typeof globalThis !== "undefined" ? globalThis : this);
