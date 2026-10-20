// 对比：金皮卖掉 vs 只卖垃圾，能活多少抽
const E = require('../web/economy.js');

function run(sellGold) {
  const s = E.create();
  let guard = 0;
  while (guard++ < 20000) {
    const p = E.plan(s, 25);
    if (p.count === 0) {
      // 清仓
      while (s.ware.length) {
        const i = s.ware.findIndex(it => sellGold || it.e.tier !== '主皮肤');
        if (i < 0) break;
        E.sellAt(s, i);
      }
      if (E.plan(s, 25).count === 0) break;
      continue;
    }
    E.pull(s, p.count);
    // 钱快见底就出货
    if (s.coins < 4000) {
      let i;
      while ((i = s.ware.findIndex(it => sellGold || it.e.tier !== '主皮肤')) >= 0) {
        E.sellAt(s, i);
      }
    }
  }
  return s.pulls;
}

function stat(sellGold, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(run(sellGold));
  a.sort((x, y) => x - y);
  const q = p => a[Math.floor(a.length * p)];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), max: a[a.length - 1] };
}

console.log('只卖绿蓝紫（金皮囤着）', stat(false, 200));
console.log('金皮也卖（清仓换钱）', stat(true, 200));
