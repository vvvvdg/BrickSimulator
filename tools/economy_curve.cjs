/* 经济曲线：把「每天能挣多少」和「每天要交多少」画出来
 * 这张表就是整个经济模型的骨架 —— 两条线的交叉点决定玩家活不活得下去。
 */
'use strict';

const path = require('path');
const DATA = require(path.join(__dirname, '..', 'js', 'data.js'));
const { BREAK_EVEN_BRICK, openEV } = require('./policies.cjs');

const CFG = DATA.CONFIG;
const EV = openEV();

function tierIncomePerAp(d) {
  const avgBricks = (d.bricks[0] + d.bricks[1]) / 2;
  const survive = 1 - d.deathChance;
  const perBrick = EV - CFG.keyPrice;
  return survive * avgBricks * perBrick - d.deathChance * d.payout;
}

const tiers = Object.values(DATA.DIFFICULTIES).map(d => ({
  id: d.id, name: d.name, perAp: tierIncomePerAp(d)
}));

const AP = CFG.apPerDay;
const workMid = (CFG.workPay[0] + CFG.workPay[1]) / 2;

console.log('=== 单次行动点的期望收益（理论值）===');
console.log('单次开砖 EV = ' + EV.toFixed(2) + '，钥匙 ' + CFG.keyPrice + '，保本砖价 ' + BREAK_EVEN_BRICK.toFixed(2));
console.log('');
for (const t of tiers) {
  console.log('  ' + t.name + '图：' + t.perAp.toFixed(1) + ' / 行动点，一天 ' + AP + ' 点 ≈ ' + (t.perAp * AP).toFixed(0));
}
console.log('  打工：  ' + workMid.toFixed(1) + ' / 行动点，一天 ' + AP + ' 点 ≈ ' + (workMid * AP).toFixed(0));
console.log('');

const best = tiers.reduce((a, b) => (b.perAp > a.perAp ? b : a));
let cumRent = 0, cumIncome = 0;

console.log('=== 30 天生存曲线（按「' + best.name + '图全打」的理论收入）===');
console.log('天   房租   当天收入  当天结余   累计房租     累计收入     累计结余');
console.log('-'.repeat(80));

let crossover = null;
for (let day = 1; day <= CFG.maxDay; day++) {
  const rent = Math.round(CFG.rentBase * Math.pow(CFG.rentGrowth, day - 1));
  const income = best.perAp * AP;
  cumRent += rent;
  cumIncome += income;
  const net = cumIncome - cumRent;
  if (crossover === null && net < 0) crossover = day;
  const bar = net >= 0 ? '+' : '-';
  console.log(
    String(day).padStart(2) + ' ' +
    String(rent).padStart(6) + ' ' +
    String(Math.round(income)).padStart(9) + ' ' +
    String(Math.round(income - rent)).padStart(10) + ' ' +
    String(Math.round(cumRent)).padStart(12) + ' ' +
    String(Math.round(cumIncome)).padStart(12) + ' ' +
    (bar + Math.abs(Math.round(net))).padStart(12)
  );
}

console.log('');
console.log('结算：');
console.log('  30 天累计房租 = ' + Math.round(cumRent).toLocaleString('en-US'));
console.log('  30 天理论收入 = ' + Math.round(cumIncome).toLocaleString('en-US') + '（完美运气、每点行动都打' + best.name + '）');
console.log('  天然缺口     = ' + Math.round(cumIncome - cumRent).toLocaleString('en-US'));
if (crossover) {
  console.log('  第 ' + crossover + ' 天开始「累计收入 < 累计房租」—— 从这天起是在吃老本/借债。');
}
console.log('');
console.log('判读：');
if (cumIncome - cumRent < 0) {
  console.log('  房子是个「抽水机」行情：纯打图必然填不满房租，');
  console.log('  玩家必须靠市场择时、出橙皮、事件拿外快才能活到最后。');
  console.log('  —— 这就是这个游戏的核心张力，不是 bug。');
} else {
  console.log('  纯打图就能覆盖房租，市场和技术都只是加分项，压力不足。');
}
