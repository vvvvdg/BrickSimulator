/* 赌博模式 · UI 壳。逻辑全在 economy.js（window.DFGame），这里只碰 DOM。 */
(function () {
  'use strict';

  var E = window.DFGame;

  var state = E.create();
  var lastItems = [];
  var busy = false;
  var flashQueue = [];
  var flashing = false;
  var finished = false;
  var inPanel = false;

  var $ = function (id) { return document.getElementById(id); };

  var view = $('view');
  var actions = $('actions');
  var elCoins = $('coins');
  var elFree = $('freePulls');
  var elSteps = $('steps');
  var pityFill = $('pityFill');
  var pityText = $('pityText');
  var pityMark = $('pityMark');
  var wareBtn = $('wareBtn');
  var trashBtn = $('trashBtn');
  var talentBtn = $('talentBtn');
  var btns = [$('pull1'), $('pull10'), $('pull25')];
  var decayEl = $('decay');

  var COIN = '<img class="coin" src="coin.svg?v=1" alt="">';

  function fmt(n) { return n.toLocaleString('en-US'); }

  function setBusy(v) {
    busy = v;
    btns.forEach(function (b) { b.disabled = v; });
  }

  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  /* ---------------- 抽卡结果 ---------------- */

  function card(item, cls) {
    var e = item.e;
    var d = document.createElement('button');
    d.className = 'card ' + cls;
    d.style.background = 'linear-gradient(160deg,' + e.c1 + ',' + e.c2 + ')';

    var t = el('span', 'tier', e.tier);
    t.style.color = e.fg;
    d.appendChild(t);

    var sub = el('span', 'grade');
    sub.style.color = e.fg;
    sub.textContent = e.tier === '主皮肤'
      ? e.grade
      : (item.cond ? '成色 ' + item.cond : '');
    if (!sub.textContent) sub.style.display = 'none';
    d.appendChild(sub);

    var p = el('span', 'pri');
    p.style.color = e.fg;
    p.textContent = fmt(item.val);
    d.appendChild(p);

    if (item.pityHit) d.appendChild(el('span', 'tag', '保底'));

    d.addEventListener('click', function () { openDetail(item, false); });
    return d;
  }

  function renderStage() {
    view.innerHTML = '';
    if (!lastItems.length) {
      view.appendChild(el('p', 'hint', '按「抽」开始'));
      return;
    }
    var n = lastItems.length;
    var grid = el('div', 'cards ' + (n === 1 ? 'single' : (n >= 25 ? 'p25' : 'ten')));
    lastItems.forEach(function (it) { grid.appendChild(card(it, '')); });
    view.appendChild(grid);
  }

  /* ---------------- HUD ---------------- */

  function render() {
    elCoins.textContent = fmt(state.coins);
    elFree.textContent = state.freePulls;
    elFree.className = 'v' + (state.freePulls > 0 ? '' : ' dim');
    elSteps.textContent = state.pulls;

    var limit = E.pityLimit(state);
    pityText.textContent = state.pity + ' / ' + limit;
    pityFill.style.width = Math.min(100, state.pity / limit * 100) + '%';
    pityMark.style.left = (Math.max(0, limit - 25) / limit * 100) + '%';

    wareBtn.textContent = E.mains(state).length;
    trashBtn.textContent = E.junk(state).length;
    talentBtn.textContent = Object.keys(state.talents).length;

    var price = E.brickPrice(state);
    $('cost1').textContent = fmt(price);
    $('cost10').textContent = fmt(price * 10);
    $('cost25').textContent = fmt(price * 25);

    var quad = E.has(state, 'quad');
    $('pull25').hidden = !quad;
    var dec = E.decayMul(state);
    decayEl.textContent = dec < 0.999 ? '贬值 ' + Math.round((1 - dec) * 100) + '%' : '';
  }

  /* ---------------- 提示 / 出金 ---------------- */

  function toast(msg) {
    var t = el('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }

  function flashTalent(t) {
    var ov = el('div', 'flash');
    var box = el('div', 'flash-card');
    box.style.background = 'linear-gradient(160deg,#7a5cd8,#2a1d52)';
    box.style.boxShadow = '0 0 60px #7a5cd8';
    box.appendChild(el('div', 'flash-tier', '天赋'));
    box.appendChild(el('div', 'flash-grade', t.name));
    var d = el('div', 'flash-val', t.desc);
    d.style.fontSize = '13px';
    d.style.lineHeight = '1.5';
    d.style.maxWidth = '80%';
    box.appendChild(d);
    ov.appendChild(box);
    document.body.appendChild(ov);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      ov.classList.add('out');
      setTimeout(function () { ov.remove(); }, 240);
    }
    ov.addEventListener('click', close);
    setTimeout(close, 2600);
  }

  function enqueueFlash(items) {
    items.forEach(function (it) { if (it.e.tier === '主皮肤') flashQueue.push(it); });
    if (!flashing) nextFlash();
  }

  function nextFlash() {
    var item = flashQueue.shift();
    if (!item) { flashing = false; return; }
    flashing = true;

    var ov = el('div', 'flash');
    var box = el('div', 'flash-card');
    box.style.background = 'linear-gradient(160deg,' + item.e.c1 + ',' + item.e.c2 + ')';
    box.style.boxShadow = '0 0 60px ' + item.e.c1;

    var h = el('div', 'flash-tier', item.e.tier);
    h.style.color = item.e.fg;
    box.appendChild(h);

    var g = el('div', 'flash-grade');
    g.style.color = item.e.fg;
    g.textContent = item.e.grade + ' · 成色值 ' + item.wear.toFixed(2);
    box.appendChild(g);

    box.appendChild(el('div', 'flash-val', COIN + ' ' + fmt(item.val)));
    ov.appendChild(box);
    document.body.appendChild(ov);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      ov.classList.add('out');
      setTimeout(function () { ov.remove(); nextFlash(); }, 220);
    }
    ov.addEventListener('click', close);
    setTimeout(close, 1700);
  }

  /* ---------------- 二级页骨架 ---------------- */

  function openPanel(title, back, hideHud) {
    inPanel = true;
    actions.hidden = true;
    view.innerHTML = '';
    var hud = document.querySelector('.hud');
    var pityBar = document.querySelector('.pity');
    if (hud) hud.style.display = hideHud ? 'none' : '';
    if (pityBar) pityBar.style.display = hideHud ? 'none' : '';
    var p = el('section', 'panel');
    var head = el('div', 'panel-head');
    head.innerHTML = '<span class="ttl"></span>';
    head.querySelector('.ttl').textContent = title;
    p.appendChild(head);
    var body = el('div', 'panel-body');
    p.appendChild(body);
    view.appendChild(p);

    var close = function () {
      inPanel = false;
      actions.hidden = false;
      if (hud) hud.style.display = '';
      if (pityBar) pityBar.style.display = '';
      if (back) back();
      else renderStage();
    };

    var foot = el('div', 'panel-foot');
    var backBtn = el('button', 'btn wide', '返回');
    backBtn.addEventListener('click', close);
    foot.appendChild(backBtn);
    p.appendChild(foot);

    return { root: p, body: body, close: close, foot: foot, title: head.querySelector('.ttl') };
  }

  /* ---------------- 金库 ---------------- */

  var GRADE_IDX = { C: 1, B: 2, A: 3, S: 4 };

  function openVault() {
    var p = openPanel('金库');
    var ms = E.mains(state).slice().sort(function (a, b) { return a.pull - b.pull; });
    p.title.textContent = '金库 ' + ms.length;

    if (!ms.length) {
      p.body.appendChild(el('p', 'hint', '还没有金皮'));
      return;
    }

    p.body.appendChild(el('p', 'hint', '条越长＝成色越好；条越厚＝磨损越低'));

    ms.reverse().forEach(function (it) {
      var row = el('div', 'vrow');

      var th = el('button', 'vthumb', it.e.grade.replace(/\s+/g, ''));
      th.style.background = 'linear-gradient(160deg,' + it.e.c1 + ',' + it.e.c2 + ')';
      th.style.color = it.e.fg;
      th.addEventListener('click', function () { openDetail(it, true, openVault); });
      row.appendChild(th);

      var rail = el('div', 'vrail');
      [25, 50, 75].forEach(function (x) {
        var tk = el('b', 'tk');
        tk.style.left = x + '%';
        rail.appendChild(tk);
      });

      var idx = GRADE_IDX[it.cond] || 1;
      var fill = el('i', 'fill');
      fill.style.width = (idx * 25) + '%';
      fill.style.height = Math.round(6 + (1 - Math.min(1, it.wear / 4)) * 12) + 'px';
      fill.style.background = it.e.grade.indexOf('极品') === 0
        ? 'linear-gradient(90deg,#e0453a,#ff7a4d)'
        : 'linear-gradient(90deg,#c98d2a,#f0c05a)';
      rail.appendChild(fill);
      row.appendChild(rail);

      row.appendChild(el('span', 'vwear', it.wear.toFixed(2)));

      var btns = el('div', 'vbtns');
      var sell = el('button', 'vsell', fmt(E.sellValue(state, it)) + '<small>卖出</small>');
      sell.addEventListener('click', function () {
        var i = state.ware.indexOf(it);
        if (i < 0) return;
        toast('+' + fmt(E.sellAt(state, i)));
        render();
        openVault();
      });
      btns.appendChild(sell);

      if (it.e.grade.indexOf('优品') === 0) {
        var tb = el('button', 'vtalent', '天赋');
        tb.addEventListener('click', function () {
          var r = E.drawTalent(state, it.uid);
          if (!r.ok) {
            toast(r.reason === 'done' ? '天赋已经集齐了'
              : '要 ' + (r.cost || 1) + ' 件金皮才够烧');
            return;
          }
          render();
          openVault();
          if (r.offer) openTalentPick(r.offer, function () { openVault(); });
          else toast('没出天赋');
        });
        btns.appendChild(tb);
      }
      row.appendChild(btns);

      p.body.appendChild(row);
    });
  }

  /* ---------------- 垃圾桶 ---------------- */

  var TRASH = [
    { tier: '绿皮', dot: '#4f9d69', synth: false },
    { tier: '蓝皮', dot: '#3d7bd6', synth: false },
    { tier: '紫皮', dot: '#a55eea', synth: true }
  ];

  function openTrash() {
    var p = openPanel('垃圾桶');

    var autoRow = el('div', 'auto-row');
    autoRow.appendChild(el('span', 'auto-lab', '抽到绿蓝自动卖掉'));
    var sw = el('button', 'switch' + (state.autoSell ? ' on' : ''), state.autoSell ? '开' : '关');
    sw.addEventListener('click', function () {
      state.autoSell = !state.autoSell;
      render();
      openTrash();
    });
    autoRow.appendChild(sw);
    p.body.appendChild(autoRow);

    TRASH.forEach(function (t) {
      var count = E.countTier(state, t.tier);
      var total = 0;
      E.junk(state).forEach(function (it) { if (it.e.tier === t.tier) total += E.sellValue(state, it); });

      var row = el('div', 'trash-row' + (t.synth ? ' wide' : ''));
      var dot = el('span', 'dot');
      dot.style.background = t.dot;
      row.appendChild(dot);
      row.appendChild(el('span', '', '<div class="nm">' + t.tier + '</div><div class="cnt">' + count + ' 件</div>'));

      var sell = el('button', '', '卖出<br>' + fmt(total));
      sell.disabled = count === 0;
      sell.addEventListener('click', function () {
        var r = E.sellTier(state, t.tier);
        toast('卖了 ' + r.n + ' 件，+' + fmt(r.got));
        render();
        openTrash();
      });
      row.appendChild(sell);

      if (t.synth) {
        var can = E.synthCount(state, t.tier);
        var need = E.synthNeed(state);
        var btn = el('button', 'hot', '合成<br>' + (can > 0 ? can + ' 次' : count + '/' + need));
        btn.disabled = can === 0;
        btn.addEventListener('click', openSynth);
        row.appendChild(btn);
      }

      p.body.appendChild(row);
    });

    p.body.appendChild(el('p', 'trash-tip', '绿皮蓝皮只能卖钱；紫皮 ' + E.synthNeed(state) + ' 件可以炼成 1 件主皮肤'));
  }

  /* ---------------- 合成 ---------------- */

  var RESULT_LABEL = ['极S', '极A', '极B', '极C', '优S', '优A', '优B', '优C'];

  function gradeColor(id) {
    var m = DF.MAINS.filter(function (x) { return x.id === id; })[0];
    return m ? m.c1 : '#666';
  }

  function openSynth() {
    var need = E.synthNeed(state);
    var purples = state.ware.filter(function (it) { return it.e.tier === '紫皮'; });
    purples.sort(function (a, b) { return a.wear - b.wear; });

    // 自动取磨损最低的 need 件，不让玩家挑
    var preview = E.synthPreview(state);

    var p = openPanel('合成', null, true);

    var info = el('p', 'synth-info',
      preview
        ? '自动取磨损最低的 <b>' + need + '</b> 件 · 平均 <b>' + preview.wear.toFixed(2) + '</b>（' + preview.band + ' 档）'
        : '紫皮不足：<b>' + purples.length + ' / ' + need + '</b> 件');
    p.body.appendChild(info);

    var list = el('div', 'purlist');
    if (!purples.length) list.appendChild(el('p', 'hint', '没有紫皮'));

    purples.forEach(function (it, i) {
      var row = el('div', 'purrow' + (preview && i < need ? ' used' : ''));
      var th = el('span', 'purdot');
      th.style.background = 'linear-gradient(160deg,' + it.e.c1 + ',' + it.e.c2 + ')';
      row.appendChild(th);

      var bar = el('div', 'pbar2');
      var fill = el('i');
      fill.style.width = Math.min(100, it.wear / 4 * 100) + '%';
      bar.appendChild(fill);
      [0.4, 1.25, 2.5].forEach(function (w) {
        var tk = el('b', 'tk');
        tk.style.left = (w / 4 * 100) + '%';
        bar.appendChild(tk);
      });
      row.appendChild(bar);

      row.appendChild(el('span', 'purval', it.wear.toFixed(2)));
      list.appendChild(row);
    });
    p.body.appendChild(list);

    if (preview) {
      p.body.appendChild(el('p', 'synth-tip', '成色越好的材料，出极品的几率越高'));
    } else {
      p.body.appendChild(el('p', 'synth-tip', '凑够 ' + need + ' 件后显示合成概率'));
    }

    var row = preview ? E.SYNTH_TABLE[preview.band] : [0, 0, 0, 0, 0, 0, 0, 0];
    var total = row.reduce(function (a, b) { return a + b; }, 0) || 1;

    var stack = el('div', 'pstack' + (preview ? '' : ' empty'));
    row.forEach(function (v, i) {
      var seg = el('i');
      seg.style.flexGrow = preview ? v : 0;
      seg.style.background = gradeColor(E.RESULT_IDS[i]);
      stack.appendChild(seg);
    });
    p.body.appendChild(stack);

    var legend = el('div', 'plegend');
    row.forEach(function (v, i) {
      var cell = el('div', 'pl-cell');
      var dot = el('span', 'pl-dot');
      dot.style.background = gradeColor(E.RESULT_IDS[i]);
      cell.appendChild(dot);
      cell.appendChild(el('span', 'pl-name', RESULT_LABEL[i]));
      cell.appendChild(el('span', 'pl-val', (v / total * 100).toFixed(1) + '%'));
      legend.appendChild(cell);
    });
    p.body.appendChild(legend);

    p.foot.classList.add('two');
    var btn = el('button', 'btn primary', preview ? '合成' : '还差 ' + (need - purples.length) + ' 件');
    btn.disabled = !preview;
    btn.addEventListener('click', function () {
      var item = E.synth(state, '紫皮');
      if (!item) { toast('材料不够'); return; }
      render();
      openSynth();
      enqueueFlash([item]);
    });
    p.foot.insertBefore(btn, p.foot.firstChild);
  }

  /* ---------------- 天赋池 ---------------- */

  function openTalents() {
    var own = Object.keys(state.talents);
    var left = E.talentsLeft(state);
    var p = openPanel('天赋 ' + own.length + ' / ' + E.TALENTS.length);

    if (!own.length) p.body.appendChild(el('p', 'hint', '还没有天赋'));

    E.TALENTS.forEach(function (t) {
      if (!state.talents[t.id]) return;
      p.body.appendChild(el('div', 'tal-row', '<b>' + t.name + '</b><span>' + t.desc + '</span>'));
    });

    if (!left.length) {
      p.body.appendChild(el('p', 'trash-tip', '天赋已经集齐了'));
      return;
    }

    var need = E.talentNeed(state);
    var rate = Math.round(E.talentRate(state) * 100);
    p.body.appendChild(el('p', 'trash-tip',
      '用 ' + need + ' 件金皮换一次，' + rate + '% 出天赋，' +
      E.talentPityNeed(state) + ' 次保底出一件'));

    var golds = E.mains(state);
    p.body.appendChild(el('p', 'tal-pity', '还差 ' + E.talentPityLeft(state) + ' 次必出 · 金皮 ' + golds.length + ' 件'));

    // 抽天赋常驻在底部，跟「返回」并排
    p.foot.classList.add('two');
    var btn = el('button', 'btn primary', '抽天赋 · ' + need + ' 件金皮');
    btn.disabled = golds.length < need;
    btn.addEventListener('click', function () {
      var r = E.drawTalent(state);
      if (!r.ok) {
        toast(r.reason === 'done' ? '天赋已集齐' : '要 ' + (r.cost || need) + ' 件金皮才够烧');
        return;
      }
      render();
      openTalents();
      if (r.offer) openTalentPick(r.offer);
      else toast('没出天赋');
    });
    p.foot.insertBefore(btn, p.foot.firstChild);
  }

  // 天赋三选一
  function openTalentPick(offer, after) {
    var ov = el('div', 'modal');
    var title = el('p', 'modal-title', '选一个天赋');
    ov.appendChild(title);
    var picks = el('div', 'picks');
    offer.forEach(function (t) {
      var b = el('button', 'pick', '<b>' + t.name + '</b><span>' + t.desc + '</span>');
      b.addEventListener('click', function () {
        E.grantTalent(state, t.id);
        ov.remove();
        render();
        if (after) after();
        else openTalents();
        flashTalent(t);
      });
      picks.appendChild(b);
    });
    ov.appendChild(picks);
    document.body.appendChild(ov);
  }

  /* ---------------- 放大预览 ---------------- */

  function openDetail(item, canSell, after) {
    if (document.querySelector('.detail-ov')) return;
    var ov = el('div', 'detail-ov');
    var box = el('div', 'detail-box');
    box.style.background = 'linear-gradient(160deg,' + item.e.c1 + ',' + item.e.c2 + ')';

    var t = el('div', 'dt-tier', item.e.tier);
    t.style.color = item.e.fg;
    box.appendChild(t);

    var g = el('div', 'dt-grade');
    g.style.color = item.e.fg;
    g.textContent = (item.e.tier === '主皮肤' ? item.e.grade : '成色 ' + item.cond) +
      (item.wear != null ? ' · ' + item.wear.toFixed(2) : '');
    box.appendChild(g);

    box.appendChild(el('div', 'dt-val', COIN + ' ' + fmt(E.sellValue(state, item))));

    var foot = el('div', 'dt-foot');
    if (canSell) {
      var b = el('button', 'dt-sell', '卖出');
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = state.ware.indexOf(item);
        if (idx < 0) { ov.remove(); return; }
        toast('+' + fmt(E.sellAt(state, idx)));
        render();
        ov.remove();
        if (after) after();
      });
      foot.appendChild(b);
    }
    var close = el('button', 'dt-close', '关闭');
    foot.appendChild(close);
    box.appendChild(foot);

    ov.appendChild(box);
    document.body.appendChild(ov);
    ov.addEventListener('click', function () { ov.remove(); });
    close.addEventListener('click', function (e) { e.stopPropagation(); ov.remove(); });
  }

  /* ---------------- 抽卡 ---------------- */

  function doPull(n) {
    if (busy || finished || inPanel) return;
    if (!E.canPlay(state)) { strand(); return; }

    var p = E.plan(state, n);
    if (p.count === 0) { toast('三角币不够，去金库或垃圾桶卖点东西'); return; }
    if (n === 25 && !E.has(state, 'quad')) { toast('25 连抽要「大盘手」天赋'); return; }

    setBusy(true);
    var out = E.pull(state, n);
    lastItems = out.items;
    renderStage();
    render();

    var golds = out.items.filter(function (it) { return it.e.tier === '主皮肤'; });
    var delay = 300 + out.count * 30;
    if (golds.length) {
      setTimeout(function () { enqueueFlash(golds); }, 260);
      delay += 700;
    }

    setTimeout(function () {
      setBusy(false);
      if (!E.canPlay(state)) strand();
    }, delay);
  }

  /* ---------------- 断粮：先给一次贷款，再破产 ---------------- */

  function strand() {
    if (finished) return;
    if (E.canLoan(state)) { openLoan(); return; }
    settle();
  }

  function openLoan() {
    if (inPanel || finished) return;
    inPanel = true;
    setBusy(true);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    var ov = el('div', 'modal result');
    ov.innerHTML =
      '<p class="modal-title">断粮</p>' +
      '<div class="res-big"><b>' + fmt(E.G.LOAN_AMOUNT) + '</b><span>三角币</span></div>' +
      '<div class="res-lines">' +
        '<div class="res-line"><span>还款方式</span><b>卖出收入扣 25%</b></div>' +
        '<div class="res-line"><span>还清为止</span><b>' + fmt(E.G.LOAN_CAP) + '</b></div>' +
        '<div class="res-line"><span>机会</span><b>这一局只能用一次</b></div>' +
      '</div>';
    var take = el('button', 'btn primary wide', '借了，继续抽');
    take.addEventListener('click', function () {
      E.takeLoan(state);
      ov.remove();
      inPanel = false;
      setBusy(false);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      render();
      toast('到账 ' + fmt(E.G.LOAN_AMOUNT));
    });
    var quit = el('button', 'btn wide', '不借了，认输');
    quit.style.marginTop = '8px';
    quit.addEventListener('click', function () {
      ov.remove();
      inPanel = false;
      settle();
    });
    ov.appendChild(take);
    ov.appendChild(quit);
    document.body.appendChild(ov);
  }

  /* ---------------- 上传成绩 ---------------- */

  var NICK_KEY = 'brick_nick';

  function openUpload(trigger, best) {
    var ov = el('div', 'modal');
    var card = el('div', 'res-card');
    card.innerHTML =
      '<p class="res-kicker">上传这局</p>' +
      '<div class="res-big"><b>' + state.pulls + '</b><span>步</span></div>' +
      '<div class="res-lines">' +
        '<div class="res-line"><span>最好的一件</span><b>' + (best ? (best.e.grade || best.e.tier) : '—') + '</b></div>' +
        '<div class="res-line"><span>磨损</span><b>' + (best && best.wear != null ? best.wear.toFixed(2) : '—') + '</b></div>' +
        '<div class="res-line"><span>卖价</span><b>' + (best ? fmt(best.val) : '—') + '</b></div>' +
      '</div>';

    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 12;
    input.placeholder = '起个昵称，1-12 个字';
    input.value = localStorage.getItem(NICK_KEY) || '';
    input.style.cssText = 'width:100%;height:46px;margin:12px 0 8px;padding:0 12px;border-radius:11px;'
      + 'border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:inherit;'
      + 'font-size:14px;font-family:inherit;outline:none';
    card.appendChild(input);

    var row = el('div', 'btns');
    var cancel = el('button', 'btn', '算了');
    var send = el('button', 'btn primary', '上传');
    row.appendChild(cancel);
    row.appendChild(send);
    card.appendChild(row);

    cancel.addEventListener('click', function () { ov.remove(); });
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });

    send.addEventListener('click', function () {
      var nick = input.value.trim();
      if (!nick) { toast('先填个昵称'); input.focus(); return; }
      if (nick.length > 12) { toast('昵称太长了'); return; }

      send.disabled = true;
      send.textContent = '上传中';
      var body = {
        nickname: nick,
        steps: state.pulls,
        best: best ? {
          tier: best.e.tier,
          grade: best.e.grade || '',
          wear: best.wear,
          val: best.val,
          cond: best.cond || ''
        } : null
      };

      fetch('api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || '上传失败');
          localStorage.setItem(NICK_KEY, nick);
          ov.remove();
          trigger.textContent = '已上传';
          trigger.disabled = true;
          var bits = [];
          if (j.rank_steps) bits.push('步数榜第 ' + j.rank_steps);
          if (j.rank_value) bits.push('皮肤榜第 ' + j.rank_value);
          toast(bits.length ? '上榜了，' + bits.join(' · ') : '上传成功');
        })
        .catch(function (err) {
          send.disabled = false;
          send.textContent = '上传';
          toast(err.message || '上传失败，等下再试');
        });
    });

    ov.appendChild(el('div', 'glow'));
    ov.appendChild(card);
    document.body.appendChild(ov);
    setTimeout(function () { input.focus(); }, 60);
  }

  /* ---------------- 结算 ---------------- */

  function settle() {
    if (finished) return;
    finished = true;
    setBusy(true);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    var best = state.best;
    var bestHtml =
      '<div class="res-line"><span>金皮</span><b>' + state.mainCount + ' 件</b></div>' +
      '<div class="res-line"><span>最好的一件</span><b>' + (best ? best.e.grade : '—') + '</b></div>' +
      '<div class="res-line"><span>成色</span><b>' +
        (best ? best.wear.toFixed(2) + ' · ' + best.cond + ' 级' : '—') + '</b></div>' +
      '<div class="res-line"><span>卖价</span><b>' + (best ? fmt(best.val) : '—') + '</b></div>';

    var ov = el('div', 'modal result');
    var card = el('div', 'res-card');
    card.innerHTML =
      '<p class="res-kicker">破产</p>' +
      '<div class="res-big"><b>' + state.pulls + '</b><span>步</span></div>' +
      '<div class="res-lines">' + bestHtml + '</div>';
    var up = el('button', 'btn primary wide', '上传这局成绩');
    up.addEventListener('click', function () { openUpload(up, best); });
    card.appendChild(up);

    var b = el('button', 'btn wide', '再来一局');
    b.addEventListener('click', function () { location.reload(); });
    card.appendChild(b);

    var home = el('button', 'res-exit', '回主菜单');
    home.addEventListener('click', function () { location.href = './'; });
    card.appendChild(home);
    ov.appendChild(el('div', 'glow'));
    ov.appendChild(card);
    document.body.appendChild(ov);
  }

  /* ---------------- 绑定 ---------------- */

  $('pull1').addEventListener('click', function () { doPull(1); });
  $('pull10').addEventListener('click', function () { doPull(10); });
  $('pull25').addEventListener('click', function () { doPull(25); });
  $('openWare').addEventListener('click', openVault);
  $('openTrash').addEventListener('click', openTrash);
  $('openTalent').addEventListener('click', openTalents);
  $('again').addEventListener('click', function () {
    if (confirm('重开一局？当前进度会丢')) location.reload();
  });

  render();
  renderStage();
})();
