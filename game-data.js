(function attachEscapeStarSeaData(root) {
  const ring = (nodes) => nodes.map((node, index) => ({ ...node, next: [nodes[(index + 1) % nodes.length].id] }));

  const stage1 = ring([
    { id: "s1_blackhole", name: "银心黑洞", short: "银心黑洞", kind: "hazard", energy: -4, power: 20, description: "能源－4，动力＋20" },
    { id: "s1_pulsar", name: "脉冲星", short: "脉冲星", kind: "hazard", energy: -3, power: -6, forcedBack: 2, noRegularDraw: true, description: "能源－3，动力－6，沿原路线后退2格；新位置不结算、不摸牌" },
    { id: "s1_station_l", name: "星际驿站·左", short: "驿站·左", kind: "station", power: 9, description: "动力＋9" },
    { id: "s1_unknown_l", name: "未知星域·左", short: "未知星域", kind: "unknown", description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s1_fortress", name: "星际堡垒", short: "星际堡垒", kind: "judgement", fortress: true, description: "另掷1枚D6；5—6时动力＋30；合法结算后，停留期间无法被其他玩家选择或受其牌效影响（含区域效果）" },
    { id: "s1_nebula", name: "弥漫星云", short: "弥漫星云", kind: "positive", energy: 1, power: 3, description: "能源＋1，动力＋3" },
    { id: "s1_station_u", name: "星际驿站·上", short: "驿站·上", kind: "station", power: 5, extraRegular: 1, description: "动力＋5，额外摸1张常规牌" },
    { id: "s1_white_dwarf", name: "白矮星", short: "白矮星", kind: "positive", starRegion: true, energy: 1, power: 5, description: "能源＋1，动力＋5" },
    { id: "s1_warp", name: "跃迁点", short: "跃迁点", kind: "warp", description: "经过或停留时可用动力购买曲速" },
    { id: "s1_star_system", name: "恒星系", short: "恒星系", kind: "positive", starRegion: true, energy: 2, power: 8, description: "能源＋2，动力＋8" },
    { id: "s1_station_r", name: "星际驿站·右", short: "驿站·右", kind: "station", power: 9, description: "动力＋9" },
    { id: "s1_supernova", name: "超新星遗迹", short: "超新星遗迹", kind: "positive", starRegion: true, energy: 2, power: 10, description: "能源＋2，动力＋10" },
    { id: "s1_unknown_r", name: "未知星域·右", short: "未知星域", kind: "unknown", description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s1_asteroids", name: "小行星带", short: "小行星带", kind: "hazard", power: -8, description: "动力－8" },
    { id: "s1_station_br", name: "星际驿站·右下", short: "驿站·右下", kind: "station", power: 5, extraRegular: 1, description: "动力＋5，额外摸1张常规牌" },
    { id: "s1_supergiant", name: "超巨星", short: "超巨星", kind: "positive", starRegion: true, power: 10, description: "动力＋10" },
  ]);

  const stage2 = ring([
    { id: "s2_warp", name: "跃迁点", short: "跃迁点", kind: "warp", description: "经过或停留时可用动力购买曲速" },
    { id: "s2_station_u", name: "星际驿站·上", short: "驿站·上", kind: "station", power: 10, extraRegular: 1, description: "动力＋10，额外摸1张常规牌" },
    { id: "s2_superblackhole", name: "超级黑洞", short: "超级黑洞", kind: "hazard", energy: -5, power: 30, description: "能源－5，动力＋30" },
    { id: "s2_gravitytrap", name: "引力陷阱", short: "引力陷阱", kind: "hazard", energy: 1, stagnation: 1, description: "能源＋1，停滞1轮" },
    { id: "s2_quark", name: "夸克星", short: "夸克星", kind: "hazard", energy: -3, power: -15, discardEquipment: "required", description: "能源－3，动力－15，弃置1张装备" },
    { id: "s2_worm_r", name: "虫洞·右", short: "虫洞·右", kind: "wormhole", pair: "s2_worm_l", description: "准确停留时传送至左侧虫洞" },
    { id: "s2_unknown_r", name: "未知星域·右", short: "未知星域", kind: "unknown", description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s2_station_r", name: "星际驿站·右", short: "驿站·右", kind: "station", power: 15, description: "动力＋15" },
    { id: "s2_antimatter", name: "反物质团", short: "反物质团", kind: "hazard", energy: 4, power: -15, description: "能源＋4，动力－15" },
    { id: "s2_unknown_b", name: "未知星域·下", short: "未知星域", kind: "unknown", description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s2_wreck", name: "陨落战舰", short: "陨落战舰", kind: "choice", discardHandReward: { energy: 2, power: 10 }, description: "可弃1张手牌：能源＋2，动力＋10" },
    { id: "s2_station_bl", name: "星际驿站·左下", short: "驿站·左下", kind: "station", extraOpportunity: 1, description: "额外摸1张机遇牌" },
    { id: "s2_crystal", name: "空洞晶体", short: "空洞晶体", kind: "positive", energy: 2, power: 10, description: "能源＋2，动力＋10" },
    { id: "s2_worm_l", name: "虫洞·左", short: "虫洞·左", kind: "wormhole", pair: "s2_worm_r", description: "准确停留时传送至右侧虫洞" },
    { id: "s2_chaos", name: "混沌乱流", short: "混沌乱流", kind: "judgement", chaos: true, description: "另掷D6：奇数能源＋2、动力－15；偶数能源－2、动力＋15" },
    { id: "s2_unknown_l", name: "未知星域·左", short: "未知星域", kind: "unknown", description: "摸1张机遇牌，再摸1张常规牌" },
  ]);

  const stage3 = [
    { id: "s3_worm_ul", name: "虫洞·左上", short: "虫洞·出口", kind: "wormhole", x: 17, y: 18, next: ["s3_dense"], description: "单向虫洞出口，不反向传送" },
    { id: "s3_dense", name: "致密星域", short: "致密星域", kind: "choice", x: 34, y: 10, next: ["s3_station_u"], discardEquipmentReward: { energy: 4, power: 40 }, description: "可弃1张装备：能源＋4，动力＋40" },
    { id: "s3_station_u", name: "星际驿站·上", short: "驿站·上", kind: "station", x: 52, y: 8, next: ["s3_vortex"], extraRegular: 1, description: "额外摸1张常规牌" },
    { id: "s3_vortex", name: "暗能量涡流", short: "暗能量涡流", kind: "hazard", x: 69, y: 13, next: ["s3_relic"], power: -25, description: "动力－25" },
    { id: "s3_relic", name: "文明遗迹", short: "文明遗迹", kind: "positive", x: 82, y: 24, next: ["s3_tunnel_ur"], extraOpportunity: 1, description: "额外摸1张机遇牌" },
    { id: "s3_tunnel_ur", name: "奇异隧道·右上", short: "奇异隧道", kind: "tunnel", x: 88, y: 39, next: ["s3_primordial"], pair: "s3_tunnel_ll", description: "另掷D6：奇数能源＋1并传送；偶数能源－2、动力＋30" },
    { id: "s3_hypertrap", name: "超维陷阱", short: "超维陷阱", kind: "hazard", x: 87, y: 56, next: ["s3_halo"], energy: -4, power: -30, stagnation: 1, description: "能源－4，动力－30，停滞1轮" },
    { id: "s3_worm_lr", name: "虫洞·右下", short: "虫洞·入口", kind: "wormhole", x: 79, y: 78, next: ["s3_gravity"], pair: "s3_worm_ul", oneWayEye: true, description: "准确停留时经宇宙之眼传送至左上出口" },
    { id: "s3_tunnel_ll", name: "奇异隧道·左下", short: "奇异隧道", kind: "tunnel", x: 22, y: 70, next: ["s3_hypertrap"], pair: "s3_tunnel_ur", description: "另掷D6：奇数能源＋1并传送；偶数能源－2、动力＋30" },
    { id: "s3_station_d", name: "星际驿站·下", short: "驿站·下", kind: "station", x: 39, y: 86, next: ["s3_tunnel_ll"], extraRegular: 1, description: "额外摸1张常规牌" },
    { id: "s3_warp", name: "跃迁点", short: "跃迁点", kind: "warp", x: 56, y: 89, next: ["s3_station_d"], description: "经过或停留时可购买最终逃离曲速" },
    { id: "s3_gravity", name: "引力波风暴", short: "引力波", kind: "hazard", x: 70, y: 87, next: ["s3_warp"], power: -15, description: "动力－15" },
    { id: "s3_primordial", name: "原初黑洞", short: "原初黑洞", kind: "hazard", x: 10, y: 58, next: ["s3_worm_lr"], energy: -4, power: 25, description: "能源－4，动力＋25" },
    { id: "s3_halo", name: "暗物质晕", short: "暗物质晕", kind: "hazard", x: 9, y: 42, next: ["s3_unknown_l"], energy: -3, power: -20, forcedForward: 2, noRegularDraw: true, description: "能源－3，动力－20，强制前进2格；新位置不结算、不摸牌" },
    { id: "s3_unknown_l", name: "未知星域·左", short: "未知星域", kind: "unknown", x: 20, y: 31, next: ["s3_eye"], description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s3_eye", name: "宇宙之眼", short: "宇宙之眼", kind: "eye", x: 37, y: 39, next: ["s3_unknown_r"], energy: 1, power: 20, description: "能源＋1，动力＋20；满足曲速即可逃离" },
    { id: "s3_unknown_r", name: "未知星域·右", short: "未知星域", kind: "unknown", x: 52, y: 50, next: ["s3_whitehole"], description: "摸1张机遇牌，再摸1张常规牌" },
    { id: "s3_whitehole", name: "白洞", short: "白洞", kind: "positive", x: 65, y: 63, next: ["s3_worm_lr"], energy: 2, description: "能源＋2" },
  ];

  const regularCards = [
    { id: "annihilation_1", face: "一万", name: "绝对湮灭", type: "instant", action: "annihilate", copies: 4, description: "湮灭响应链中一张未完成牌，或弃置场上一张装备。" },
    { id: "dispersed_array", face: "二万", name: "分散阵列", type: "equipment", slot: "plunder", action: "equip", copies: 4, description: "短距与爆破掠夺对你无效；你受到的超距掠夺翻倍。" },
    { id: "space_bright_3", face: "三万", name: "空域法则（明）", type: "instant", action: "map_bright", copies: 4, description: "当前地图格正面效果翻倍，负面效果无效。" },
    { id: "space_dark_4", face: "四万", name: "空域法则（暗）", type: "instant", action: "map_dark", copies: 4, description: "当前地图格负面效果翻倍，正面效果无效。" },
    { id: "self_loop", face: "五万", name: "自循环", type: "equipment", slot: "trade", action: "equip", copies: 4, description: "你可以与自己交易。" },
    { id: "space_bright_6", face: "六万", name: "空域法则（明）", type: "instant", action: "map_bright", copies: 4, description: "当前地图格正面效果翻倍，负面效果无效。" },
    { id: "space_dark_7", face: "七万", name: "空域法则（暗）", type: "instant", action: "map_dark", copies: 4, description: "当前地图格负面效果翻倍，正面效果无效。" },
    { id: "cosmic_encounter", face: "八万", name: "宇宙奇遇", type: "normal", action: "drawOpportunity", copies: 4, description: "摸1张机遇牌。" },
    { id: "annihilation_9", face: "九万", name: "绝对湮灭", type: "instant", action: "annihilate", copies: 4, description: "湮灭响应链中一张未完成牌，或弃置场上一张装备。" },

    { id: "long_plunder_1", face: "一条", name: "超距掠夺Ⅰ", type: "normal", action: "plunder", range: "any", power: 8, requiresTarget: true, copies: 4, description: "无视位置，选择1名其他玩家，掠夺其8动力。" },
    { id: "energy_field", face: "二条", name: "能源磁场", type: "equipment", slot: "plunder", action: "equip", copies: 4, description: "每次掠夺额外掠夺2能源。" },
    { id: "precision_lock", face: "三条", name: "精确锁定", type: "instant", action: "plunder_double", copies: 4, description: "使当前一次掠夺效果翻倍。" },
    { id: "plunder_reversal", face: "四条", name: "掠夺异位", type: "instant", action: "plunder_reverse", copies: 4, description: "使当前一次掠夺的全部合法目标分支反转。" },
    { id: "engine_shield", face: "五条", name: "引擎护盾", type: "equipment", slot: "plunder", action: "equip", copies: 4, description: "你受到的掠夺动力数值－5。" },
    { id: "short_plunder", face: "六条", name: "短距掠夺", type: "normal", action: "plunder", range: "same", power: 20, energy: 4, requiresTarget: true, copies: 4, description: "选择同格玩家，掠夺20动力、4能源。" },
    { id: "blast_plunder", face: "七条", name: "爆破掠夺", type: "normal", action: "plunder", range: "area", power: 5, requiresNode: true, copies: 4, description: "选择地图格，掠夺该格及普通相邻格内所有其他玩家各5动力。" },
    { id: "power_field", face: "八条", name: "动力磁场", type: "equipment", slot: "plunder", action: "equip", copies: 4, description: "你造成的掠夺动力数值＋5。" },
    { id: "long_plunder_2", face: "九条", name: "超距掠夺Ⅱ", type: "normal", action: "plunder", range: "higher", power: 30, requiresTarget: true, copies: 4, description: "选择更高宇宙的玩家，掠夺30动力。" },

    { id: "trade_energy_1", face: "一筒", name: "换取能源Ⅰ", type: "normal", action: "trade", payPower: 10, gainEnergy: 5, requiresTarget: true, copies: 4, description: "与任一其他玩家以10动力强制交换5能源。" },
    { id: "energy_discount", face: "二筒", name: "能源优惠", type: "equipment", slot: "trade", action: "equip", copies: 4, description: "换取能源改为5动力换5能源。" },
    { id: "sales_ban", face: "三筒", name: "禁售协议", type: "instant", action: "trade_break", copies: 4, description: "破坏当前一次尚未结算的交易。" },
    { id: "trade_talk", face: "四筒", name: "交易洽谈", type: "instant", action: "trade_protect", copies: 4, description: "使当前交易无法被禁售协议破坏。" },
    { id: "power_discount", face: "五筒", name: "动力优惠", type: "equipment", slot: "trade", action: "equip", copies: 4, description: "换取动力改为5能源换50动力。" },
    { id: "trade_power_1", face: "六筒", name: "换取动力Ⅰ", type: "normal", action: "trade", payEnergy: 5, gainPower: 30, requiresTarget: true, copies: 4, description: "与任一其他玩家以5能源强制交换30动力。" },
    { id: "trade_power_2", face: "七筒", name: "换取动力Ⅱ", type: "normal", action: "trade", payEnergy: 8, gainPower: 40, requiresTarget: true, copies: 4, description: "与任一其他玩家以8能源强制交换40动力。" },
    { id: "force_take", face: "八筒", name: "强取豪夺", type: "equipment", slot: "trade", action: "equip", copies: 4, description: "名称含“换取”的牌改为超距掠夺Ⅱ。" },
    { id: "trade_energy_2", face: "九筒", name: "换取能源Ⅱ", type: "normal", action: "trade", payPower: 20, gainEnergy: 8, requiresTarget: true, copies: 4, description: "与任一其他玩家以20动力强制交换8能源。" },

    { id: "system_takeover", face: "中", name: "动力系统接管", type: "normal", action: "moveOther", minSteps: 1, maxSteps: 2, requiresTarget: true, copies: 4, description: "指定任一玩家向前移动1—2格；触发最终格，不常规摸牌。" },
    { id: "directed_jump", face: "发", name: "定向跃迁", type: "normal", action: "moveSelf", minSteps: 1, maxSteps: 6, copies: 4, description: "自己向前移动1—6格；触发最终格，不常规摸牌。" },
    { id: "warp_discount", face: "白", name: "专享折上折", type: "equipment", slot: "mobility", action: "equip", copies: 4, description: "每购买1曲速所需动力－5。" },

    { id: "dyson_sphere", face: "春", name: "戴森球", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "经过白矮星、恒星系、超新星遗迹、超巨星时取得该格动力与能源收益。" },
    { id: "wormhole_probe", face: "夏", name: "虫洞窥探", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "准确停在虫洞时可取消原生传送，改为自选前进1—6格。" },
    { id: "space_probe", face: "秋", name: "空间探针", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "经过宇宙之眼时取得该格动力与能源收益（能源＋1、动力＋20），但不因此获胜。" },
    { id: "supernav", face: "冬", name: "超算导航", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "每次向前计格移动可增加1格；不能与时序叠加并存。" },
    { id: "double_plunder", face: "梅", name: "双倍掠夺", type: "equipment", slot: "plunder", action: "equip", copies: 1, description: "你的掠夺效果翻倍。" },
    { id: "double_trade", face: "兰", name: "双倍交易", type: "equipment", slot: "trade", action: "equip", copies: 1, description: "你的交易收益翻倍；额外收益来自供应区。" },
    { id: "wide_radar", face: "竹", name: "广域巡天雷达", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "摸常规牌时查看顶3张，选择本次应摸数量。" },
    { id: "deep_radar", face: "菊", name: "深空扫描雷达", type: "equipment", slot: "mobility", action: "equip", copies: 1, description: "摸机遇牌时查看顶2张，选择本次应摸数量。" },
  ];

  const opportunityCards = [
    { id: "space_ban", face: "南", name: "时空禁制", type: "immediate", action: "judge_regular_1_9", copies: 2, description: "翻1张常规牌判定；一或九时动力－20。" },
    { id: "stumble", face: "南", name: "步履蹒跚", type: "immediate", action: "judge_flower", copies: 2, description: "翻1张常规牌判定；花牌时停滞1轮。" },
    { id: "supercharge", face: "西", name: "超级快充", type: "equipment", slot: "mobility", action: "equip", copies: 2, description: "每次获得动力时额外获得5动力。" },
    { id: "time_stack", face: "西", name: "时序叠加", type: "equipment", slot: "mobility", action: "equip", copies: 2, description: "公共移动可选择两枚公共骰点数之和。" },
    { id: "chosen_jump", face: "北", name: "自选跃迁", type: "immediate", action: "teleport", copies: 2, description: "传送至当前宇宙任一格并结算该格效果；传至跃迁点可购买曲速。" },
    { id: "allied_support", face: "北", name: "盟军支援", type: "immediate", action: "drawRegular", amount: 2, copies: 2, description: "立即摸2张常规牌。" },
    { id: "delisted", face: "东", name: "退市", type: "equipment", slot: "trade", action: "equip", copies: 1, description: "不能交易或被交易；自己的地图正面资源收益翻倍。" },
    { id: "reclusive", face: "东", name: "隐世", type: "equipment", slot: "plunder", action: "equip", copies: 1, description: "不能掠夺或被掠夺；自己的地图正面资源收益翻倍。" },
    { id: "immediate_unequip", face: "东", name: "立即卸甲", type: "immediate", action: "unequip_any", copies: 2, description: "指定弃置全场任意一张正在生效的装备牌。" },
  ];

  const data = {
    version: "1.0.4-paper-0930",
    title: "《逃离星海》一对一人机对战",
    universes: [
      { id: "stage1", index: 1, name: "第一宇宙｜银河系境内", nodes: stage1, stationIds: ["s1_station_l", "s1_station_u", "s1_station_r", "s1_station_br"] },
      { id: "stage2", index: 2, name: "第二宇宙｜宇宙空间", nodes: stage2, stationIds: ["s2_station_u", "s2_station_r", "s2_station_bl"] },
      { id: "stage3", index: 3, name: "第三宇宙｜巨引源核心", nodes: stage3, stationIds: ["s3_station_u", "s3_station_d"] },
    ],
    regularCards,
    opportunityCards,
    phases: [["roll", "公开掷骰"], ["choose", "双方选点"], ["warp", "跃迁购买"], ["response", "响应窗口"], ["decision", "效果选择"], ["personal", "个人回合"], ["end", "轮次结束"]],
    prototypeRulings: [
      "电子版暂定：响应窗口按当前行动者之后依次询问；连续一圈无人响应后逆序结算。最新纸面写“按出牌顺序依次结算”，未明确反制链处理；此逆序解析是本地候选采用的电子裁定，公开提交前须向用户展示，不冒称纸面原文。",
      "【立即卸甲】先公开目标装备再开放响应；不选择受其他玩家目标保护的装备。没有合法装备时空结算；响应期间原目标离场后不追打替换装备。这是电子版目标处理裁定。",
      "牌效移动不进行基础摸牌；落点印刷额外牌、未知格的专门摸牌与跨阶驿站效果仍按对应格结算。经过装备只在非最终格取资源，不重复取得落点收益。",
      "【广域巡天雷达】与【深空扫描雷达】现在由装备持有者私密选牌，并按“下一张最先摸到”的顺序安排未选牌。",
      "同一玩家同时取得多张立即牌时，由本人依次指定公开和结算顺序，不再使用自动摸牌顺序。",
      "【戴森球】与【空间探针】每次“经过”触发都会单独打开响应窗口；若装备在窗口内被【绝对湮灭】弃置，本次触发不结算。",
      "人机对战中出现逃离者后完成当前轮；同轮逃离算平局，否则先逃离者获胜。",
      "“安全退出本局”和自动存档是电子版的辅助机制。一对一模式中退出即认输，不属于实体基础规则。",
    ],
  };

  root.EscapeStarSeaData = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof globalThis !== "undefined" ? globalThis : this);
