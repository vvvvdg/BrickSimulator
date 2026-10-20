/* 开砖期望值校准：跑 20 万次开箱，算单次开箱的期望价值、保本砖价、各档实际出货率
 * 注意：皮肤价格单位是「三角券」，要乘 couponRate 才是三角币口径的 EV。
 * 用法：node tools/ev.cjs
 */
'use strict';

const path = require('path');
const { Game, RARITIES } = require(path.join(__dirname, '..', 'js', 'game.js'));
const CFG = Game.prototype.constructor ? null : null;
const CONFIG = require(path.join(__dirname, '..', 'js', 'data.js')).CONFIG;

const N = 200000;

const g = new Game({ seed: 20261019 });
g.state.keys = N + 10;
g.state.bricks = N + 10;

const perTier = {};
const ids = RARITIES.map(r => r.id);
ids.forEach(id => { perTier[id] = { n: 0, sum: 0 }; });

const r = g.openBricks(N);
if (!r.ok) { console.error('开箱失败', r); process.exit(1); }

let sumCoupon = 0;
for (const item of r.results) {
  const s = item.skin;
  perTier[s.rarity].n++;
  perTier[s.rarity].sum += s.basePrice;
  sumCoupon += s.basePrice;
}

const evCoupon = sumCoupon / N;
const ev = evCoupon * CONFIG.couponRate;   // 折算成三角币
const unit = CONFIG.brickBasePrice + CONFIG.keyPrice;

console.log('=== 开砖期望值（官方概率 / 75 抽硬保底）===');
console.log(`样本 ${N} 次\n`);
console.log('档位'.padEnd(14), '次数'.padEnd(9), '实际概率'.padEnd(12), '均价(券)'.padEnd(12), 'EV贡献(币)');
for (const r_ of RARITIES) {
  const t = perTier[r_.id];
  const p = (t.n / N * 100);
  const avg = t.n ? Math.round(t.sum / t.n) : 0;
  const contrib = (t.sum / N * CONFIG.couponRate).toFixed(2);
  console.log(
    r_.name.padEnd(14),
    String(t.n).padEnd(9),
    (p.toFixed(4) + '%').padEnd(12),
    String(avg).padEnd(12),
    contrib
  );
}

const tierTot = {};
for (const r_ of RARITIES) {
  tierTot[r_.tier] = (tierTot[r_.tier] || 0) + perTier[r_.id].n;
}
console.log('\n--- 按品质合计 ---');
for (const k of ['green', 'blue', 'purple', 'main']) {
  console.log(k.padEnd(8), (tierTot[k] / N * 100).toFixed(3) + '%');
}

console.log('\n单抽成本 = 砖 ' + CONFIG.brickBasePrice + ' + 钥匙 ' + CONFIG.keyPrice + ' = ' + unit);
console.log(`单次开箱 EV(券) = ${evCoupon.toFixed(2)}`);
console.log(`单次开箱 EV(币) = ${ev.toFixed(2)}   （×${CONFIG.couponRate} 折算）`);
console.log(`每抽净收益      = ${(ev - unit).toFixed(2)}   (${((ev / unit - 1) * 100).toFixed(1)}%)`);
console.log(`保本砖价        = ${(ev - CONFIG.keyPrice).toFixed(2)}  （低于此价买砖才赚）`);
console.log(`当前基准砖价    = ${CONFIG.brickBasePrice}`);

const pMain = perTier['mainS'].n + perTier['mainA'].n + perTier['mainB'].n + perTier['mainC'].n
            + perTier['mainUS'].n + perTier['mainUA'].n + perTier['mainUB'].n + perTier['mainUC'].n;
console.log(`\n主皮肤实测出货率 = ${(pMain / N * 100).toFixed(4)}%  → 平均 ${(N / pMain).toFixed(1)} 抽出 1 件`);
console.log(`理论值           = 67.0 抽（0.31% + 75 硬保底）`);

console.log('\n判读：');
const gap = ev / unit - 1;
if (gap < -0.05) console.log('  ✔ 明显负 EV，开砖是消费不是生产 —— 符合真实 gacha 的设计。');
else if (gap > 0.02) console.log('  ✘ 正 EV，开砖等于印钞，必须压价格。');
else console.log('  ~ 接近打平，需要靠市场波动和择时制造 edge。');
