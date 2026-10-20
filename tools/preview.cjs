// 从 web/app.js 里把 TABLE 抠出来，生成一张全档位对照图，方便肉眼检查色差。
// 用法：node tools/preview.cjs   -> 写 preview.html，再用 tools/shot.cjs 截图
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'web', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

const m = src.match(/var TABLE = (\[[\s\S]*?\n  \]);/);
if (!m) {
  console.error('没找到 TABLE');
  process.exit(1);
}

const TABLE = eval(m[1]);

const cards = TABLE.map(function (e) {
  const grade = e.grade ? '<span class="g">' + e.grade + '</span>' : '';
  return '<div class="c" style="background:linear-gradient(160deg,' + e.c1 + ',' + e.c2 + ');color:' + e.fg + '">' +
    '<span class="t">' + e.tier + '</span>' + grade + '</div>';
}).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:14px;background:#0a0d12;font-family:system-ui,sans-serif;
display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.c{aspect-ratio:2/1;border-radius:8px;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:2px;font-weight:700}
.t{font-size:12px}.g{font-size:9px;opacity:.9}
</style></head><body>${cards}</body></html>`;

fs.writeFileSync(path.join(__dirname, '..', 'preview.html'), html);
console.log('ok 共 ' + TABLE.length + ' 档');
