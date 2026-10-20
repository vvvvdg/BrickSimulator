// 赌博模式压力测试：跑几千局，看「撑多少步」的分布，顺便验证期望确实是负的。
// 用法：node tools/simgamble.cjs [局数]
const E = require('../web/economy.js');
const DF = require('../web/data.js');

const N = Number(process.argv[2] || 2000);

// 把蓝绿紫按需卖掉换钱
function liquidate(s, keepPurple) {
  E.sellTier(s, '绿皮');
  E.sellTier(s, '蓝皮');
  if (!keepPurple) E.sellTier(s, '紫皮');
}

// 真没钱了：连主皮肤一起卖
function fireSale(s) {
  liquidate(s, false);
  E.sellTier(s, '主皮肤');
}

// 一个会玩的人：钱快见底就清垃圾。
function sane(s) {
  const cost = E.G.PULL_COST;
  if (s.coins < cost * 4) liquidate(s, false);
  if (s.coins >= cost * 25) return 25;
  if (s.coins >= cost * 10) return 10;
  return 1;
}

// 攒着不卖：只靠手上现金硬抽
function hoarder(s) {
  const cost = E.G.PULL_COST;
  if (s.coins >= cost * 25) return 25;
  if (s.coins >= cost * 10) return 10;
  return 1;
}

// 只冲保底：保底过半了才抽
function sniper(s) {
  const L = E.pityLimit(s);
  const cost = E.G.PULL_COST;
  if (s.coins < cost * 4) liquidate(s, true);
  if (s.pity < L - 20 && s.coins < cost * 40) return 0;
  if (s.coins >= cost * 25) return 25;
  if (s.coins >= cost * 10) return 10;
  return 1;
}

function run(policy) {
  const s = E.create();
  let guard = 0;

  while (guard++ < 30000 && s.pulls < 30000) {
    let n = policy(s);
    if (n === 0) {
      if (E.plan(s, 1).count === 0) {
        fireSale(s);
        if (E.plan(s, 1).count === 0) break;
      }
      n = 1;
    }

    const out = E.pull(s, n);
    if (out.count === 0) {
      fireSale(s);
      if (E.plan(s, 1).count === 0) break;
    }

    for (let i = 0; i < out.talentEvents; i++) {
      const left = E.talentsLeft(s);
      if (!left.length) continue;
      E.grantTalent(s, left[Math.floor(Math.random() * left.length)].id);
    }
  }

  // 收尾：把库存全卖了算净资产
  liquidate(s, false);
  E.sellTier(s, '主皮肤');
  return s;
}

function pct(arr, p) {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

// 理论期望：开一大轮，把回款除以抽数
(function checkEV() {
  const s = E.create();
  s.coins = 1e12;
  s.autoSell = false;   // 全进仓库，才能事后统一估值
  const M = 200000;
  E.pull(s, M);
  let total = 0;
  s.ware.forEach(it => { total += E.sellValue(s, it); });
  const ev = total / M;
  const cost = E.G.PULL_COST;
  console.log('单抽回款 ' + ev.toFixed(1) + ' 三角币');
  console.log('单抽成本 ' + cost + ' 三角币，回本率 ' + (ev / cost * 100).toFixed(1) + '%');
  console.log('（裸值，没算天赋；天赋会把回本率往上抬）\n');
})();

const POLICIES = [
  ['稳健流', sane],
  ['囤货流', hoarder],
  ['保底流', sniper]
];

POLICIES.forEach(([name, fn]) => {
  const steps = [], mains = [];
  for (let i = 0; i < N; i++) {
    const s = run(fn);
    steps.push(s.pulls);
    mains.push(s.mainCount);
  }
  console.log(name);
  console.log('  步数  p10 ' + pct(steps, .1) + ' / p50 ' + pct(steps, .5) +
    ' / p90 ' + pct(steps, .9) + ' / 最大 ' + Math.max(...steps));
  console.log('  平均步数 ' + (steps.reduce((a, b) => a + b, 0) / N).toFixed(0) +
    '，主皮肤平均 ' + (mains.reduce((a, b) => a + b, 0) / N).toFixed(2) + ' 件\n');
});
