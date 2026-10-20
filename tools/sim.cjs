/* 压力测试：让不同打法的机器人各跑 N 局，看谁活得久 */
'use strict';

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'game.js'));
const { POLICIES } = require('./policies.cjs');

const RUNS = Number(process.env.RUNS || 2000);
const SEED0 = 20261019;

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

function fmt(n) {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 10000) return sign + (a / 10000).toFixed(2) + '万';
  return sign + Math.round(a).toLocaleString('en-US');
}

function runPolicy(name, fn, seedBase) {
  let bankrupt = 0, cleared = 0;
  const days = [], netWorths = [];
  const agg = { pulls: 0, orange: 0, red: 0, raids: 0, deaths: 0, purple: 0 };

  for (let i = 0; i < RUNS; i++) {
    const g = new Game({ seed: seedBase + i * 7919 });
    let guard = 0;
    while (!g.state.over && guard++ < 200) {
      const r = fn(g);
      if (r && r.stop) break;
      const e = g.endDay();
      if (e.bankrupt) { bankrupt++; break; }
      if (e.cleared) { cleared++; break; }
    }
    days.push(g.state.day);
    netWorths.push(g.netWorth());
    agg.pulls += g.state.stats.pulls;
    agg.purple += g.state.stats.purple;
    agg.orange += g.state.stats.orange;
    agg.red += g.state.stats.red;
    agg.raids += g.state.stats.raids;
    agg.deaths += g.state.stats.deaths;
  }

  const ds = days.slice().sort((a, b) => a - b);
  const nw = netWorths.slice().sort((a, b) => a - b);

  return {
    name,
    bankruptRate: bankrupt / RUNS,
    clearRate: cleared / RUNS,
    medianDay: pct(ds, 0.5),
    p10: pct(nw, 0.1),
    p50: pct(nw, 0.5),
    p90: pct(nw, 0.9),
    pullsPerRun: agg.pulls / RUNS,
    orangePerRun: agg.orange / RUNS,
    redPerRun: agg.red / RUNS,
    raidsPerRun: agg.raids / RUNS,
    deathsPerRun: agg.deaths / RUNS
  };
}

console.log(`压力测试：每个策略 ${RUNS} 局\n`);
console.log('策略'.padEnd(22) + '破产率'.padEnd(10) + '通关率'.padEnd(10) + '中位存活'.padEnd(10) + '净资产 p10 / p50 / p90'.padEnd(30) + '开砖/局'.padEnd(10) + '橙/局');
console.log('-'.repeat(112));

const results = [];
let seed = SEED0;
for (const [name, fn] of Object.entries(POLICIES)) {
  const r = runPolicy(name, fn, seed);
  seed += 100000;
  results.push(r);
  console.log(
    name.padEnd(22) +
    (r.bankruptRate * 100).toFixed(1).padStart(5) + '%   ' +
    (r.clearRate * 100).toFixed(1).padStart(5) + '%   ' +
    String(r.medianDay + '天').padEnd(10) +
    (fmt(r.p10) + ' / ' + fmt(r.p50) + ' / ' + fmt(r.p90)).padEnd(30) +
    r.pullsPerRun.toFixed(1).padEnd(10) +
    r.orangePerRun.toFixed(2)
  );
}

console.log('');
console.log('=== 健康度判读 ===');
const good = results.filter(r => r.clearRate >= 0.35 && r.clearRate <= 0.75);
const bad = results.filter(r => r.clearRate < 0.05);
if (good.length) console.log('  ✔ 有策略落在 35%-75% 通关率区间：' + good.map(r => r.name).join('、'));
else console.log('  ✘ 没有任何策略落在可玩区间（35%-75%），需要调数值');
if (bad.length) console.log('  · 明显打不过的策略（<5%）：' + bad.map(r => r.name).join('、'));
const spread = Math.max(...results.map(r => r.clearRate)) - Math.min(...results.map(r => r.clearRate));
console.log(`  · 策略间通关率极差 = ${(spread * 100).toFixed(1)} 个百分点` +
  (spread > 0.3 ? '（分层明显，好玩法' : '（分层不足，选择没意义'));
