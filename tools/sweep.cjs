/* 房租参数扫描：找「好打法能活、坏打法活不下去」的区间
 * 用法：node tools/sweep.cjs [每格局数]
 */
'use strict';

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'game.js'));
const { POLICIES } = require('./policies.cjs');

const RUNS = Number(process.argv[2] || 400);
const RENT_BASES = [150, 200, 250, 300, 350];
const RENT_GROWTHS = [1.00, 1.01, 1.02, 1.03, 1.04];
const WATCH = ['稳妥流（普通/卖砖）', '搬砖流（机密/全开）', '梭哈流（绝密/借钱）'];

function clearRate(name, fn, cfg, seedBase) {
  let cleared = 0;
  for (let i = 0; i < RUNS; i++) {
    const g = new Game({ seed: seedBase + i * 7919, config: cfg });
    let guard = 0;
    while (!g.state.over && guard++ < 200) {
      fn(g);
      const e = g.endDay();
      if (e.bankrupt) break;
      if (e.cleared) { cleared++; break; }
    }
  }
  return cleared / RUNS;
}

function label(n) {
  return (n * 100).toFixed(0).padStart(3) + '%';
}

console.log(`房租扫描：每格 ${RUNS} 局\n`);
console.log('表里每个格子 = 该策略的通关率\n');

for (const pname of WATCH) {
  const fn = POLICIES[pname];
  console.log('--- ' + pname + ' ---');
  process.stdout.write('租金基数\\增长率  ');
  for (const gr of RENT_GROWTHS) process.stdout.write(String(gr).padEnd(8));
  console.log();
  for (const base of RENT_BASES) {
    process.stdout.write(String(base).padEnd(15));
    for (const gr of RENT_GROWTHS) {
      const cfg = { rentBase: base, rentGrowth: gr };
      const r = clearRate(pname, fn, cfg, 1000 + base * 13 + Math.round((gr - 1) * 1000));
      process.stdout.write(label(r).padEnd(8));
    }
    console.log();
  }
  console.log();
}

// 最后按「分层是否健康」排个序
console.log('=== 候选区间（要求：稳妥流 < 25%，搬砖流 45%-80%，且搬砖流 > 稳妥流 + 30 个点）===');
const scored = [];
for (const base of RENT_BASES) {
  for (const gr of RENT_GROWTHS) {
    const cfg = { rentBase: base, rentGrowth: gr };
    const seed = 777 + base + Math.round((gr - 1) * 1000);
    const safe = clearRate(WATCH[0], POLICIES[WATCH[0]], cfg, seed);
    const grind = clearRate(WATCH[1], POLICIES[WATCH[1]], cfg, seed + 5000);
    if (safe < 0.25 && grind >= 0.45 && grind <= 0.80 && grind - safe > 0.30) {
      scored.push({ base, gr, safe, grind });
    }
  }
}
if (!scored.length) {
  console.log('  ✘ 没找到。需要继续调整其他参数（砖价/产出/房租基数）。');
} else {
  scored.sort((a, b) => (b.grind - b.safe) - (a.grind - a.safe));
  for (const s of scored) {
    console.log(`  rentBase=${s.base} rentGrowth=${s.gr}  稳妥 ${(s.safe*100).toFixed(0)}% / 搬砖 ${(s.grind*100).toFixed(0)}%`);
  }
}
