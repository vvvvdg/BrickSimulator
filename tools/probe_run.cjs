const E = require('../web/economy.js');

// 一个「会玩的玩家」：没钱先清垃圾，还不够就卖金皮，全卖完还抽不起才算死
function play(maxTalents) {
  const s = E.create();
  if (maxTalents) E.TALENTS.forEach(t => E.grantTalent(s, t.id));

  for (let guard = 0; guard < 60000; guard++) {
    let n = s.coins >= E.brickPrice(s) * 10 ? 10 : 1;
    let out = E.pull(s, n);
    if (out.count) continue;

    // 抽不起：清垃圾
    while (E.junk(s).length) E.sellAt(s, 0);
    out = E.pull(s, n);
    if (out.count) continue;

    // 还抽不起：卖金皮（最便宜的先卖）
    while (s.ware.length) {
      E.sellAt(s, 0);
      out = E.pull(s, n);
      if (out.count) break;
    }
    if (!out.count) break;
  }
  return s.pulls;
}

function stat(maxTalents, n) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(play(maxTalents));
  arr.sort((a, b) => a - b);
  const q = p => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), max: arr[arr.length - 1] };
}

const N = Number(process.argv[2] || 40);
console.log('无天赋', JSON.stringify(stat(false, N)));
console.log('满天赋', JSON.stringify(stat(true, N)));
