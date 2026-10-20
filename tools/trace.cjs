/* 单局追踪：把某一天一天的全过程打出来，用来找 bug */
'use strict';

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'game.js'));
const { POLICIES } = require('./policies.cjs');

const name = process.argv[2] || '搬砖流（机密/全开）';
const seed = Number(process.argv[3] || 20261019);
const fn = POLICIES[name];
if (!fn) {
  console.error('可用策略：', Object.keys(POLICIES).join(' / '));
  process.exit(1);
}

const g = new Game({ seed });
console.log('策略：' + name + '   种子：' + seed + '\n');
console.log('天 现金     砖   钥匙 皮肤数 砖价   净值      欠款    开砖累计 房租');
console.log('-'.repeat(92));

let guard = 0;
while (!g.state.over && guard++ < 200) {
  fn(g);
  const s = g.state;
  const rent = g.rentFor(s.day);
  const e = g.endDay();
  console.log(
    String(s.day).padStart(2) + ' ' +
    String(Math.round(s.cash)).padStart(9) + ' ' +
    String(s.bricks).padStart(4) + ' ' +
    String(s.keys).padStart(4) + ' ' +
    String(s.skins.length).padStart(6) + ' ' +
    String(Math.round(s.brickPrice)).padStart(6) + ' ' +
    String(Math.round(g.netWorth())).padStart(9) + ' ' +
    String(Math.round(s.debt)).padStart(8) + ' ' +
    String(s.stats.pulls).padStart(8) + ' ' +
    String(rent).padStart(6) +
    (e.bankrupt ? '  << 破产' : '') +
    (e.cleared ? '  << 通关' : '')
  );
}

console.log('\n--- 最后 25 条日志 ---');
for (const line of g.state.log.slice(-25)) {
  console.log('[' + line.day + '] ' + line.text);
}
console.log('\n结果：' + g.state.outcome + '  存活 ' + g.state.day + ' 天  净资产 ' + Math.round(g.netWorth()));
console.log('统计：', JSON.stringify(g.state.stats));
