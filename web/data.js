/* 抽砖 · 公共数据层
 * 概率表、软保底曲线、成色规则、随机工具都在这里。
 * 「模拟抽奖」和「赌博模式」共用这一份，改数值只改这里。
 */
(function (global) {
  'use strict';

  var PITY = 75;
  // weight 是万分比：1 = 0.01%
  // 官方主皮肤只有 0.31%，且纯硬保底，平均 67 抽才出一件，其中近八成靠第 75 抽。
  // 这里加了一段软保底：第 50 抽开始爬坡，出货点散在 50–75 之间，不至于每次都精确卡 75。
  // 想要官方原味：把 mainRate 直接 return 0.0031。
  // 主皮肤内部八档的权重是官方比例的等比放大，所以「主皮肤里头 C/B/A/S 各占几成」与官方一致。
  var TABLE = [
    { id: 'green',  tier: '绿皮', grade: '',      w: 6730, c1: '#3d7a54', c2: '#1b392a', fg: '#a8e6c0' },
    { id: 'blue',   tier: '蓝皮', grade: '',      w: 2528, c1: '#2f6bbd', c2: '#142f58', fg: '#b6d6ff' },
    { id: 'purple', tier: '紫皮', grade: '',      w: 708,  c1: '#7f45c7', c2: '#391b61', fg: '#e0c4ff' },

    { id: 'mainUC', tier: '主皮肤', grade: '优品 C', w: 51.613, c1: '#a3762f', c2: '#4a3418', fg: '#ffe3b0', hi: true },
    { id: 'mainUA', tier: '主皮肤', grade: '优品 A', w: 38.710, c1: '#ad7830', c2: '#4d3416', fg: '#ffe6b6', hi: true },
    { id: 'mainUB', tier: '主皮肤', grade: '优品 B', w: 38.710, c1: '#b57c31', c2: '#523818', fg: '#ffe8b9', hi: true },
    { id: 'mainUS', tier: '主皮肤', grade: '优品 S', w: 32.258, c1: '#bd8032', c2: '#573c1a', fg: '#ffeabc', hi: true },

    // 极品 S 比官方更稀缺：把官方那一格砍掉一半，多出来的都给极品 C
    { id: 'mainC',  tier: '主皮肤', grade: '极品 C', w: 20.162, c1: '#d9a53a', c2: '#6e4b12', fg: '#fff3d4', hi: true },
    { id: 'mainB',  tier: '主皮肤', grade: '极品 B', w: 12.903, c1: '#ec8a1c', c2: '#753d0a', fg: '#fff2d0', hi: true },
    { id: 'mainA',  tier: '主皮肤', grade: '极品 A', w: 4.032,  c1: '#f26a12', c2: '#7c2c06', fg: '#ffecd8', hi: true },
    { id: 'mainS',  tier: '主皮肤', grade: '极品 S', w: 1.613,  c1: '#dc3a2e', c2: '#671410', fg: '#ffe1de', hi: true }
  ];

  var MAINS = TABLE.filter(function (e) { return e.tier === '主皮肤'; });
  var NONMAIN = TABLE.filter(function (e) { return e.tier !== '主皮肤'; });
  var MAIN_TOTAL = MAINS.reduce(function (a, e) { return a + e.w; }, 0);
  var NONMAIN_TOTAL = NONMAIN.reduce(function (a, e) { return a + e.w; }, 0);

  // 软保底：前 49 抽平打 0.6%，第 50 抽开始爬坡到第 74 抽 6%，第 75 抽必出。
  // 实测分布正好是「四分之一在爬坡前、一半在爬坡段、四分之一吃保底」。
  // 保底上限可以被天赋改动，所以曲线跟着 limit 走：爬坡段固定 25 抽。
  function mainRate(n, limit) {
    var L = limit || PITY;
    var start = L - 25;
    if (n < start) return 0.006;
    var t = (n - start) / (L - 1 - start);   // 爬坡起点 0，最后一抽前 1
    return 0.03 + 0.03 * t;                  // 3% 爬到 6%
  }

  function pick(list, total) {
    var r = Math.random() * total;
    var acc = 0;
    for (var i = 0; i < list.length; i++) {
      acc += list[i].w;
      if (r < acc) return list[i];
    }
    return list[list.length - 1];
  }

  // 成色 = 磨损。官方：≤0.4 是 S、0.4~1.25 是 A、1.25~2.5 是 B、>2.5 是 C，
  // 抽到就固定，不会越用越旧。只有主皮肤带成色：它的 S/A/B/C 是官方概率表里的。
  var WEAR_BANDS = [
    { g: 'S', lo: 0.02, hi: 0.40 },
    { g: 'A', lo: 0.40, hi: 1.25 },
    { g: 'B', lo: 1.25, hi: 2.50 },
    { g: 'C', lo: 2.50, hi: 4.00 }
  ];

  function wearBand(letter) {
    for (var i = 0; i < WEAR_BANDS.length; i++) {
      if (WEAR_BANDS[i].g === letter) return WEAR_BANDS[i];
    }
    return WEAR_BANDS[1];
  }

  function rollWear(isMain, grade) {
    if (!isMain) return null;
    var band = wearBand((grade || '').slice(-1));
    return { cond: band.g, wear: band.lo + Math.random() * (band.hi - band.lo) };
  }

  // 抽一发。ctx 需要 { pity, pulls, limit, onMain(n, pityHit) }
  function roll(ctx) {
    var limit = ctx.limit || PITY;
    var n = ctx.pity + 1;
    var e, pityHit = false;

    if (n >= limit) {
      e = pick(MAINS, MAIN_TOTAL);
      pityHit = true;
    } else if (Math.random() < mainRate(n, limit) * (ctx.rateMul || 1)) {
      e = pick(MAINS, MAIN_TOTAL);
    } else {
      e = pick(NONMAIN, NONMAIN_TOTAL);
    }

    var isMain = (e.tier === '主皮肤');
    var w = rollWear(isMain, e.grade || '');

    return {
      e: e,
      pityHit: pityHit,
      isMain: isMain,
      index: n,                    // 本抽是这一轮的第几抽
      pityAfter: isMain ? 0 : n,
      cond: w ? w.cond : null,
      wear: w ? w.wear : null
    };
  }

  global.DF = {
    PITY: PITY,
    TABLE: TABLE,
    MAINS: MAINS,
    NONMAIN: NONMAIN,
    MAIN_TOTAL: MAIN_TOTAL,
    NONMAIN_TOTAL: NONMAIN_TOTAL,
    mainRate: mainRate,
    pick: pick,
    roll: roll,
    rollWear: rollWear,
    WEAR_BANDS: WEAR_BANDS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.DF;
})(typeof globalThis !== 'undefined' ? globalThis : window);
