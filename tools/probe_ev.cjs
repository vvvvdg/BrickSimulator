// 赌博模式单抽回款（不打折、不贬值）：把所有东西都卖掉的平均值
const E = require('../web/economy.js');
const DF = require('../web/data.js');

const N = 200000;
let sum = 0, gold = 0, junk = 0, gN = 0, pity = 0;
for (let i = 0; i < N; i++) {
  const r = DF.roll({ pity: pity, limit: 75, rateMul: 1 });
  pity = r.isMain ? 0 : r.pityAfter;
  const hasWear = r.e.tier === '主皮肤' || r.e.tier === '紫皮';
  const cond = hasWear ? (r.cond || 'B') : null;
  let val = E.PRICE[r.e.id] || 0;
  if (r.e.tier === '主皮肤') val = Math.round(val * E.WEAR_MUL[cond]);
  sum += val;
  if (r.e.tier === '主皮肤') { gold += val; gN++; } else junk += val;
}

const per = sum / N;
console.log('单抽期望回款', per.toFixed(1));
console.log('  其中绿蓝紫', (junk / N).toFixed(1), ' 主皮肤', (gold / N).toFixed(1));
console.log('成本', E.G.PULL_COST, ' 回本率', (per / E.G.PULL_COST * 100).toFixed(1) + '%');
console.log('每抽净亏', (E.G.PULL_COST - per).toFixed(1));
console.log('起始', E.G.START, '→ 纯烧可撑', Math.round(E.G.START / (E.G.PULL_COST - per)), '抽');
