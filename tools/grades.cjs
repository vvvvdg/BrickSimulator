// 直接从 web/app.js 抠出权重，算实际出货分布（含软保底），不用手算
const fs = require('fs');
const p = require('path');

const src = fs.readFileSync(p.join(__dirname, '..', 'web', 'app.js'), 'utf8');

const table = eval(src.match(/var TABLE = (\[[\s\S]*?\n  \]);/)[1]);
const pity = Number(src.match(/var PITY = (\d+);/)[1]);
const rate = new Function('n', src.match(/function mainRate\(n\) \{([\s\S]*?)\n  \}/)[1]);

const mains = table.filter(e => e.tier === '主皮肤');
const mainTotal = mains.reduce((a, e) => a + e.w, 0);

let S = 1, avgPulls = 0;
for (let n = 1; n <= pity; n++) {
  const r = n >= pity ? 1 : rate(n);
  avgPulls += S;
  S *= (1 - r);
}

console.log('单抽周期长度 ' + avgPulls.toFixed(1) + ' 抽\n');
console.log('成色      占主皮肤    单抽概率    平均几抽一件');
let sum = 0;
mains.slice().sort((a, b) => b.w - a.w).forEach(e => {
  const share = e.w / mainTotal;
  sum += share;
  const perPull = share / avgPulls;
  console.log(
    e.grade.padEnd(8, ' ') +
    (share * 100).toFixed(2).padStart(7) + '%' +
    (perPull * 100).toFixed(4).padStart(11) + '%' +
    (avgPulls / share).toFixed(0).padStart(12) + ' 抽'
  );
});
console.log('\n占比合计 ' + (sum * 100).toFixed(2) + '%');
