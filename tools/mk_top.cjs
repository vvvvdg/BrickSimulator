// 造一个只出指定档位的测试页，专门用来看放大特写的样式
// 用法：node tools/mk_top.cjs mainS,mainA   （默认全极品）
const fs = require('fs');
const p = require('path');

const ids = (process.argv[2] || 'mainA,mainB,mainC,mainS').split(',');
const src = p.join(__dirname, '..', 'web');
const out = p.join(__dirname, '..', '_t');
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'style.css']) fs.copyFileSync(p.join(src, f), p.join(out, f));

let js = fs.readFileSync(p.join(src, 'app.js'), 'utf8');
js = js.replace(
  "var MAINS = TABLE.filter(function (e) { return e.tier === '主皮肤'; });",
  "var MAINS = TABLE.filter(function (e) { return " + JSON.stringify(ids) + ".indexOf(e.id) >= 0; });"
);
js = js.replace('var PITY = 75;', 'var PITY = 3;');
fs.writeFileSync(p.join(out, 'app.js'), js);
console.log('ok -> _t/  ' + ids.join(','));
