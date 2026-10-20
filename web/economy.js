/* 赌博模式 · 经济内核（纯逻辑，不碰 DOM，Node 里能直接跑）
 * 三角币是血：买砖买钥匙抽砖，出货进仓库，手动卖成三角币。
 * 抽的期望回款低于成本，所以长期一定亏 —— 分数就是撑了多少步。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.DFGame = factory(root.DF);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DF) {
  'use strict';

  var G = {
    START: 8000,
    PULL_COST: 90,
    BASE_PITY: 75,
    COMBO_EVERY: 40,
    COMBO_FREE: 5,
    BLACK_REBATE: 800,
    TALENT_COST: 1500,
    TALENT_RATE: 0.75,
    TALENT_PITY: 2,
    SYNTH_NEED: 15,
    // 贬值：抽到 DECAY_START 之后开始指数掉价（每 DECAY_SPAN 抽减半，最低 5%），DECAY_MAX 已废弃
    DECAY_START: 180,
    DECAY_SPAN: 800,
    DECAY_KNEE: 500,
    DECAY_FAST: 200,
    DECAY_MAX: 0.5,
    // 贷款：一生一次
    LOAN_AMOUNT: 6000,
    LOAN_SKIM: 0.25,
    LOAN_CAP: 9000
  };

  // 卖价（三角币口径）。主皮肤再按成色乘一个系数。
  var PRICE = {
    green: 35, blue: 80, purple: 150,
    mainUC: 1300, mainUA: 1700, mainUB: 1700, mainUS: 2300,
    mainC: 4000, mainB: 5800, mainA: 6500, mainS: 32000
  };

  var WEAR_MUL = { S: 1.25, A: 1.08, B: 1, C: 0.9 };
  var WEAR_WEIGHTS = [8, 42, 38, 12];

  var SHORT = {
    green: '绿', blue: '蓝', purple: '紫',
    mainUC: '优C', mainUA: '优A', mainUB: '优B', mainUS: '优S',
    mainC: '极C', mainB: '极B', mainA: '极A', mainS: '极S'
  };

  // 炼金：20 个紫皮 → 1 件主皮肤（官方规则；绿蓝只值钱，不能炼）
  var SYNTH = [
    { from: '紫皮', need: 20, to: '主皮肤' }
  ];

  // 合成结果：材料平均磨损决定档位，档位决定主皮肤八档的几率（百分比）
  var RESULT_IDS = ['mainS', 'mainA', 'mainB', 'mainC', 'mainUS', 'mainUA', 'mainUB', 'mainUC'];
  var SYNTH_TABLE = {
    S: [4, 6, 9, 12, 20, 20, 17, 12],
    A: [1.5, 3, 6, 9, 19, 22, 21, 18.5],
    B: [0.5, 1.5, 3, 6, 16, 24, 25, 24],
    C: [0.2, 0.6, 1.4, 3, 12, 26, 30, 26.8]
  };

  var TALENTS = [
    { id: 'combo',   name: '连击',     desc: '每抽满 40 抽，白送 5 抽' },
    { id: 'bulk',    name: '批发',     desc: '抽卡单价 -10%' },
    { id: 'resell',  name: '二手商',   desc: '所有卖价 +6%' },
    { id: 'pity',    name: '保底加速', desc: '保底从 75 抽缩到 67 抽' },
    { id: 'bank',    name: '钱庄',     desc: '合成材料 15 件降到 10 件' },
    { id: 'black',   name: '黑市',     desc: '每抽满 40 抽，返 800 三角币' },
    { id: 'eye',     name: '眼力',     desc: '主皮肤卖价 +8%' },
    { id: 'gambler', name: '赌徒',     desc: '抽一次便宜 8%，但保底多等 15 抽' },
    { id: 'luck',    name: '手气',     desc: '主皮肤出货率 +8%' },
    { id: 'frugal',  name: '抠门',     desc: '三角币低于 5000 时，卖价 +10%' },
    { id: 'quad',    name: '大盘手',   desc: '解锁 25 连抽' },
    { id: 'market',  name: '行情嗅觉', desc: '贬值速度减半' },
    { id: 'loan',    name: '高利贷',   desc: '断粮时可借一次 6,000，之后卖出收入扣 25% 还债' }
  ];

  var uid = 0;

  function create() {
    return {
      coins: G.START,
      ware: [],
      pulls: 0,
      pity: 0,
      freePulls: 0,
      talents: {},
      talentPity: 0,
      comboNext: 0,
      blackNext: 0,
      spent: 0,
      earned: 0,
      mainCount: 0,
      best: null,
      over: false,
      autoSell: true,
      loanTaken: false,
      loanOwed: 0,
      loanRepaid: 0
    };
  }

  /* 赛季末贬值：前段慢、过膝点后加速，且不封底，一直往下掉 */
  function decayMul(s) {
    var over = s.pulls - G.DECAY_START;
    if (over <= 0) return 1;
    if (has(s, 'market')) over *= 0.75;
    var slow = Math.min(over, G.DECAY_KNEE);
    var fast = Math.max(0, over - G.DECAY_KNEE);
    var half = slow / G.DECAY_SPAN + fast / G.DECAY_FAST;
    return Math.max(0.02, Math.pow(0.5, half));
  }

  function has(s, id) { return !!s.talents[id]; }

  function brickPrice(s) {
    var p = G.PULL_COST;
    if (has(s, 'bulk')) p *= 0.9;
    if (has(s, 'gambler')) p *= 0.92;
    return Math.round(p);
  }

  function keyPrice() {
    return 0;
  }

  function pityLimit(s) {
    return G.BASE_PITY - (has(s, 'pity') ? 8 : 0) + (has(s, 'gambler') ? 15 : 0);
  }

  function bandOf(wear) {
    var b = DF.WEAR_BANDS;
    for (var i = 0; i < b.length; i++) {
      if (wear <= b[i].hi) return b[i].g;
    }
    return 'C';
  }

  function randomWear() {
    var total = 0, i;
    for (i = 0; i < WEAR_WEIGHTS.length; i++) total += WEAR_WEIGHTS[i];
    var r = Math.random() * total, acc = 0, band = DF.WEAR_BANDS[1];
    for (i = 0; i < DF.WEAR_BANDS.length; i++) {
      acc += WEAR_WEIGHTS[i];
      if (r < acc) { band = DF.WEAR_BANDS[i]; break; }
    }
    return band.lo + Math.random() * (band.hi - band.lo);
  }

  function sellMul(s, item) {
    var m = 1;
    if (has(s, 'resell')) m += 0.06;
    if (item.e.tier === '主皮肤' && has(s, 'eye')) m += 0.08;
    if (has(s, 'frugal') && s.coins < 5000) m += 0.1;
    return m;
  }

  function sellValue(s, item) {
    return Math.max(1, Math.round(item.val * sellMul(s, item) * decayMul(s)));
  }

  /* 到账：还欠着贷款时先扣走一部分还债 */
  function credit(s, amount) {
    if (s.loanOwed <= 0) { s.coins += amount; s.earned += amount; return amount; }
    var cut = Math.min(s.loanOwed, Math.round(amount * G.LOAN_SKIM));
    s.loanOwed -= cut;
    s.loanRepaid += cut;
    s.coins += amount - cut;
    s.earned += amount - cut;
    return amount - cut;
  }

  function takeLoan(s) {
    if (s.loanTaken) return null;
    s.loanTaken = true;
    s.loanOwed = G.LOAN_CAP;
    s.coins += G.LOAN_AMOUNT;
    return { amount: G.LOAN_AMOUNT, owed: G.LOAN_CAP };
  }

  function canLoan(s) { return has(s, 'loan') && !s.loanTaken; }

  function plan(s, n) {
    var c = s.coins, f = s.freePulls;
    var price = brickPrice(s);
    var cnt = 0, cost = 0;

    for (var i = 0; i < n; i++) {
      var need = 0;
      if (f > 0) f--;
      else need = price;
      if (c < need) break;
      c -= need;
      cost += need;
      cnt++;
    }
    return { count: cnt, coins: c, free: f, cost: cost };
  }

  function makeItem(r, pullNo) {
    var e = r.e;
    var hasWear = e.tier === '主皮肤' || e.tier === '紫皮';
    var wear = hasWear ? (r.wear != null ? r.wear : randomWear()) : null;
    var cond = wear == null ? null : (r.cond || bandOf(wear));
    var val = PRICE[e.id] || 0;
    if (e.tier === '主皮肤') val = Math.round(val * WEAR_MUL[cond]);
    return { uid: ++uid, e: e, cond: cond, wear: wear, val: val, pull: pullNo, pityHit: r.pityHit };
  }

  function pull(s, n) {
    var p = plan(s, n);
    var out = { count: 0, items: [], spent: 0 };

    if (p.count === 0) return out;

    s.coins = p.coins;
    s.freePulls = p.free;
    s.spent += p.cost;
    out.spent = p.cost;

    for (var i = 0; i < p.count; i++) {
      var r = DF.roll({
        pity: s.pity,
        limit: pityLimit(s),
        rateMul: has(s, 'luck') ? 1.08 : 1
      });
      s.pity = r.isMain ? 0 : r.pityAfter;
      s.pulls++;

      var item = makeItem(r, s.pulls);
      out.items.push(item);

      // 自动卖绿蓝：省掉「每抽完跑去垃圾桶点一下」的杂活
      if (s.autoSell && (item.e.tier === '绿皮' || item.e.tier === '蓝皮')) {
        out.autoSold = (out.autoSold || 0) + credit(s, sellValue(s, item));
      } else {
        s.ware.push(item);
      }

      if (r.isMain) {
        s.mainCount++;
        if (!s.best || item.val > s.best.val) s.best = item;
      }

      if (has(s, 'combo') && s.pulls >= s.comboNext) {
        s.freePulls += G.COMBO_FREE;
        s.comboNext = s.pulls + G.COMBO_EVERY;
      }
      if (has(s, 'black') && s.pulls >= s.blackNext) {
        s.coins += G.BLACK_REBATE;
        s.blackNext = s.pulls + 40;
      }
    }

    out.count = p.count;
    return out;
  }

  function canPlay(s) {
    if (s.freePulls > 0) return true;
    if (s.coins >= brickPrice(s)) return true;
    return s.ware.length > 0;
  }

  function sellAt(s, index) {
    var item = s.ware[index];
    if (!item) return 0;
    var v = credit(s, sellValue(s, item));
    s.ware.splice(index, 1);
    return v;
  }

  /* ---------- 仓库分层 ---------- */

  function mains(s) {
    return s.ware.filter(function (it) { return it.e.tier === '主皮肤'; });
  }

  function junk(s) {
    return s.ware.filter(function (it) { return it.e.tier !== '主皮肤'; });
  }

  function countTier(s, tier) {
    var n = 0;
    for (var i = 0; i < s.ware.length; i++) {
      if (s.ware[i].e.tier === tier) n++;
    }
    return n;
  }

  // 卖出某一档全部
  function sellTier(s, tier) {
    var keep = [], got = 0, n = 0;
    s.ware.forEach(function (it) {
      if (it.e.tier === tier) {
        got += credit(s, sellValue(s, it));
        n++;
      } else keep.push(it);
    });
    s.ware = keep;
    return { n: n, got: got };
  }

  /* ---------- 炼金 ---------- */

  function synthNeed(s) {
    return has(s, 'bank') ? 10 : G.SYNTH_NEED;
  }

  // 由材料档位按权重表抽一件主皮肤
  function rollSynth(band) {
    var row = SYNTH_TABLE[band] || SYNTH_TABLE.B;
    var total = 0, i;
    for (i = 0; i < row.length; i++) total += row[i];
    var r = Math.random() * total, acc = 0, idx = 0;
    for (i = 0; i < row.length; i++) {
      acc += row[i];
      if (r < acc) { idx = i; break; }
    }
    var id = RESULT_IDS[idx];
    for (i = 0; i < DF.MAINS.length; i++) {
      if (DF.MAINS[i].id === id) return DF.MAINS[i];
    }
    return DF.MAINS[DF.MAINS.length - 1];
  }

  // 当前材料（可以自己挑 uids；不传就是磨损最低的那一批）
  function pickMaterials(s, need, uids) {
    var list = s.ware.filter(function (it) { return it.e.tier === '紫皮'; });
    if (uids && uids.length) {
      var set = {};
      uids.forEach(function (u) { set[u] = true; });
      list = list.filter(function (it) { return set[it.uid]; });
    }
    list.sort(function (a, b) { return a.wear - b.wear; });
    return uids && uids.length ? list : list.slice(0, need);
  }

  function synthPreview(s, uids) {
    var need = synthNeed(s);
    var picked = pickMaterials(s, need, uids);
    if (picked.length < need) return null;
    var sum = 0;
    picked.forEach(function (it) { sum += it.wear; });
    var wear = sum / picked.length;
    return { count: picked.length, wear: wear, band: bandOf(wear) };
  }

  function synthRule(tier) {
    for (var i = 0; i < SYNTH.length; i++) {
      if (SYNTH[i].from === tier) return SYNTH[i];
    }
    return null;
  }

  function synthCount(s, tier) {
    var rule = synthRule(tier);
    if (!rule) return 0;
    return Math.floor(countTier(s, tier) / synthNeed(s));
  }

  function synth(s, tier, uids) {
    var rule = synthRule(tier);
    if (!rule) return null;
    var need = synthNeed(s);
    if (countTier(s, tier) < need) return null;

    // 材料：选中的那批（没选就是磨损最低的 need 件）
    var picked = pickMaterials(s, need, uids);
    if (picked.length < need) return null;
    var pickedUids = {};
    picked.forEach(function (it) { pickedUids[it.uid] = true; });
    s.ware = s.ware.filter(function (it) { return !pickedUids[it.uid]; });

    var sum = 0;
    picked.forEach(function (it) { sum += it.wear; });
    var wear = sum / picked.length;
    var cond = bandOf(wear);

    var e = rollSynth(cond);

    // 档位跟着磨损走：材料平均磨损落在哪一档，出来的就是哪一档。
    // 原来的做法是「档位另摇一个」，于是会出现「极品 C 配 0.66」这种自相矛盾的东西。
    var mainPrefix = (e.grade || '').indexOf('极品') === 0 ? 'main' : 'mainU';
    for (var k = 0; k < DF.MAINS.length; k++) {
      if (DF.MAINS[k].id === mainPrefix + cond) { e = DF.MAINS[k]; break; }
    }

    var val = PRICE[e.id] || 0;
    if (e.tier === '主皮肤') val = Math.round(val * WEAR_MUL[cond]);

    var item = { uid: ++uid, e: e, cond: cond, wear: wear, val: val, pull: s.pulls, pityHit: false };
    s.ware.push(item);
    if (e.tier === '主皮肤') {
      s.mainCount++;
      if (!s.best || item.val > s.best.val) s.best = item;
    }
    return item;
  }

  function talentsLeft(s) {
    return TALENTS.filter(function (t) { return !has(s, t.id); });
  }

  function grantTalent(s, id) {
    s.talents[id] = true;
    if (id === 'combo') s.comboNext = s.pulls + G.COMBO_EVERY;
    if (id === 'black') s.blackNext = s.pulls + 40;
  }

  /* ---------- 天赋池 ----------
   * 门票是金皮：越往后要的金皮越多、出率越低、保底越远；出了天赋是三选一。
   */
  function talentCost() { return G.TALENT_COST; }

  function ownedCount(s) { return Object.keys(s.talents).length; }
  function talentNeed(s) { return 1 + Math.floor(ownedCount(s) / 5); }
  function talentRate(s) { return Math.max(0.35, G.TALENT_RATE - ownedCount(s) * 0.03); }
  function talentPityNeed(s) { return G.TALENT_PITY + Math.floor(ownedCount(s) / 4); }

  function talentPityLeft(s) {
    return Math.max(0, talentPityNeed(s) - s.talentPity);
  }

  function drawTalent(s, uid) {
    var left = talentsLeft(s);
    if (!left.length) return { ok: false, reason: 'done' };

    var need = talentNeed(s);
    var golds = mains(s);
    if (golds.length < need) return { ok: false, reason: 'nopelt', cost: need };

    // 门票：指定的那件优先，不够再用最便宜的补
    golds.sort(function (a, b) { return a.val - b.val; });
    var burn = [];
    if (uid != null) {
      var lead = golds.filter(function (it) { return it.uid === uid; })[0];
      if (lead) burn.push(lead);
    }
    golds.forEach(function (it) {
      if (burn.length < need && burn.indexOf(it) < 0) burn.push(it);
    });
    burn.forEach(function (it) { s.ware.splice(s.ware.indexOf(it), 1); });

    s.talentPity++;

    var hit = s.talentPity >= talentPityNeed(s) || Math.random() < talentRate(s);
    if (!hit) return { ok: true, offer: null, pity: s.talentPity, cost: need };

    s.talentPity = 0;
    var pool = left.slice(), offer = [];
    for (var i = 0; i < 3 && pool.length; i++) {
      offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return { ok: true, offer: offer, cost: need };
  }

  return {
    G: G, PRICE: PRICE, WEAR_MUL: WEAR_MUL, SHORT: SHORT, TALENTS: TALENTS,
    SYNTH: SYNTH, WEAR_WEIGHTS: WEAR_WEIGHTS,
    create: create, pull: pull, plan: plan,
    brickPrice: brickPrice, pityLimit: pityLimit,
    sellValue: sellValue, sellMul: sellMul,
    canPlay: canPlay,
    sellAt: sellAt, sellTier: sellTier, countTier: countTier,
    mains: mains, junk: junk,
    synth: synth, synthCount: synthCount, synthNeed: synthNeed,
    synthPreview: synthPreview, rollSynth: rollSynth,
    RESULT_IDS: RESULT_IDS, SYNTH_TABLE: SYNTH_TABLE,
    talentsLeft: talentsLeft, grantTalent: grantTalent, has: has,
    talentCost: talentCost, talentPityLeft: talentPityLeft, drawTalent: drawTalent,
    talentNeed: talentNeed, talentRate: talentRate, talentPityNeed: talentPityNeed,
    ownedCount: ownedCount,
    decayMul: decayMul, canLoan: canLoan, takeLoan: takeLoan, credit: credit
  };
});
