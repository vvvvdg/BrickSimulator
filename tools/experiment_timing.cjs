/* 核心验证实验：择时到底有没有价值？
 *
 * 对比三种打法在不同房租强度下的表现：
 *   搬砖流   —— 有砖就开，不看价
 *   均衡流   —— 砖便宜才开、贵就卖砖，皮肤等热度
 *   梭哈流   —— 只打绝密
 *
 * 判读标准：如果「均衡流」在通关率接近的前提下，净资产中位数明显高于搬砖流，
 * 说明「择时」这条策略轴立得住，市场波动值得做进正式版。
 */
'use strict';

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'game.js'));
const { POLICIES } = require('./policies.cjs');

const RUNS = Number(process.env.RUNS || 1500);

const CASES = [
  { base: 160, gr: 1.03 },
  { base: 180, gr: 1.035 },
  { base: 200, gr: 1.04 },
  { base: 220, gr: 1.04 },
  { base: 240, gr: 1.045 }
];

const NAMES = ['搬砖流（机密/全开）', '均衡流（机密/择时）', '梭哈流（绝密/借钱）'];

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] || 0;
}

function bucket(name, cfg, seedBase) {
  const fn = POLICIES[name];
  let cleared = 0;
  const worth = [];
  const pulls = [];
  for (let i = 0; i < RUNS; i++) {
    const g = new Game({ seed: seedBase + i * 7919, config: cfg });
    let guard = 0;
    while (!g.state.over && guard++ < 200) {
      fn(g);
      const e = g.endDay();
      if (e.bankrupt) break;
      if (e.cleared) { cleared++; break; }
    }
    worth.push(g.netWorth());
    pulls.push(g.state.stats.pulls);
  }
  return {
    clear: cleared / RUNS,
    p50: median(worth),
    pulls: pulls.reduce((a, b) => a + b, 0) / RUNS
  };
}

console.log(`择时价值验证：每格 ${RUNS} 局\n`);

for (const c of CASES) {
  const cfg = { rentBase: c.base, rentGrowth: c.gr };
  const rent30 = Math.round(c.base * Math.pow(c.gr, 29));
  const rentTotal = Math.round(c.base * (Math.pow(c.gr, 30) - 1) / (c.gr - 1));
  console.log(`【房租 ${c.base}/天，日增 ${((c.gr - 1) * 100).toFixed(1)}%】第30天房租 ${rent30}，30天累计 ${rentTotal}`);

  const rows = NAMES.map((n, i) => ({ name: n, ...bucket(n, cfg, 3000 + i * 100000 + c.base) }));

  const grind = rows[0], timing = rows[1], degen = rows[2];
  const worthGain = timing.p50 - grind.p50;
  console.log(
    '  搬砖流 通关 ' + (grind.clear * 100).toFixed(1).padStart(5) + '%  净资产中位 ' + Math.round(grind.p50).toLocaleString('en-US').padStart(8) +
    '   |  均衡流 通关 ' + (timing.clear * 100).toFixed(1).padStart(5) + '%  净资产中位 ' + Math.round(timing.p50).toLocaleString('en-US').padStart(8) +
    '   |  梭哈流 通关 ' + (degen.clear * 100).toFixed(1).padStart(5) + '%  净资产中位 ' + Math.round(degen.p50).toLocaleString('en-US').padStart(8)
  );
  const verdict = worthGain > 300 ? '✔ 择时值钱' : (worthGain > 0 ? '~ 择时略赚' : '✘ 择时不值钱');
  console.log('     择时带来的净资产增量：' + (worthGain >= 0 ? '+' : '') + Math.round(worthGain).toLocaleString('en-US') +
    '  (' + verdict + ')，开砖次数 ' + grind.pulls.toFixed(0) + ' vs ' + timing.pulls.toFixed(0));
  console.log();
}
