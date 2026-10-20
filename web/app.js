/* 模拟抽奖 · 纯概率，不花钱
 * 概率表、软保底、成色规则都在 data.js 里，这里只管交互和渲染。
 */
(function () {
  'use strict';

  var DF = window.DF;
  var PITY = DF.PITY;
  var TABLE = DF.TABLE;
  var MAINS = DF.MAINS;
  var MAIN_TOTAL = DF.MAIN_TOTAL;
  var NONMAIN = DF.NONMAIN;
  var NONMAIN_TOTAL = DF.NONMAIN_TOTAL;
  var mainRate = DF.mainRate;
  var pick = DF.pick;
  var rollWear = DF.rollWear;

  // 统计按四档归并（权重只是给个颜色和图例用）
  var GROUPS = [
    { key: 'green',  name: '绿皮',   color: '#4f9d69' },
    { key: 'blue',   name: '蓝皮',   color: '#3d7bd6' },
    { key: 'purple', name: '紫皮',   color: '#a55eea' },
    { key: 'main',   name: '主皮肤', color: '#f0932b' }
  ];

  var state = {
    pity: 0,
    pulls: 0,
    counts: { green: 0, blue: 0, purple: 0, main: 0 },
    mainGrades: {},
    seg: 0,            // 已经结束的保底周期数，用来给一批结果分段
    lastCycle: null,   // 上一次出货用了多少抽
    lastPityHit: false
  };

  function rollOnce() {
    var seg = state.seg;
    state.pulls++;

    var r = DF.roll({ pity: state.pity, limit: PITY });
    var e = r.e;
    var isMain = r.isMain;

    if (isMain) {
      state.pity = 0;
      state.lastCycle = r.index;
      state.lastPityHit = r.pityHit;
      state.seg++;
    } else {
      state.pity = r.pityAfter;
    }

    var g = isMain ? 'main' : e.id;
    state.counts[g]++;
    if (isMain) {
      var k = e.grade;
      state.mainGrades[k] = (state.mainGrades[k] || 0) + 1;
    }

    return {
      e: e, pityHit: r.pityHit, seg: seg, pull: state.pulls,
      cond: r.cond, wear: r.wear
    };
  }

  // ---------------- DOM ----------------
  var stage = document.getElementById('stage');
  var pityText = document.getElementById('pityText');
  var pityFill = document.getElementById('pityFill');
  var pityLastText = document.getElementById('pityLastText');
  var pityLastFill = document.getElementById('pityLastFill');
  var statList = document.getElementById('statList');
  var totalEl = document.getElementById('totalLine');
  var btn1 = document.getElementById('draw1');
  var btn10 = document.getElementById('draw10');
  var btn25 = document.getElementById('draw25');
  var btnReset = document.getElementById('reset');
  var BTNS = [btn1, btn10, btn25];

  function makeCard(res, past, split) {
    var e = res.e;
    var d = document.createElement('div');
    var cls = 'card';
    if (e.hi) cls += ' hi';
    if (e.tier === '主皮肤') cls += ' main';
    if (past) cls += ' past';
    if (split) cls += ' split';
    d.className = cls;
    d.style.background = 'linear-gradient(160deg,' + e.c1 + ',' + e.c2 + ')';
    d.style.color = e.fg;

    var t = document.createElement('div');
    t.className = 'tier';
    t.textContent = e.tier;
    d.appendChild(t);

    if (e.grade) {
      var gEl = document.createElement('div');
      gEl.className = 'grade';
      gEl.textContent = e.grade;
      d.appendChild(gEl);
    }

    if (res.wear != null) {
      var wEl = document.createElement('div');
      wEl.className = 'wear';
      wEl.textContent = res.wear.toFixed(2);
      d.appendChild(wEl);
    }

    d.addEventListener('click', function () { openPreview(res); });

    if (res.pityHit) {
      var tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = '保底';
      d.appendChild(tag);
    }
    return d;
  }

  function renderResults(list) {
    stage.innerHTML = '';
    var wrap = document.createElement('div');
    var cls = list.length === 1 ? 'single' : (list.length >= 25 ? 'p25' : 'ten');
    wrap.className = 'cards ' + cls;

    // 这一批里如果有出货，出货之后抽的才是「本轮」，前面的都属于刚结束的那一轮
    list.forEach(function (res, i) {
      var past = res.seg < state.seg;
      var split = i > 0 && res.seg !== list[i - 1].seg;
      var card = makeCard(res, past, split);
      card.style.animationDelay = (i * 55) + 'ms';
      wrap.appendChild(card);
    });
    stage.appendChild(wrap);
  }

  function renderPity() {
    pityText.textContent = state.pity + ' / ' + PITY;
    pityFill.style.width = (state.pity / PITY * 100) + '%';

    if (state.lastCycle == null) {
      pityLastText.textContent = '—';
      pityLastText.className = 'pv';
      pityLastFill.style.width = '0%';
    } else {
      pityLastText.textContent = state.lastCycle + ' 抽';
      pityLastText.className = 'pv' + (state.lastCycle >= PITY ? ' hit' : '');
      pityLastFill.style.width = (state.lastCycle / PITY * 100) + '%';
    }
  }

  function renderStats() {
    statList.innerHTML = '';
    GROUPS.forEach(function (g) {
      var n = state.counts[g.key];
      var p = state.pulls ? (n / state.pulls * 100) : 0;
      var li = document.createElement('li');

      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = g.color;

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = g.name;

      var ct = document.createElement('span');
      ct.className = 'ct';
      ct.textContent = n;

      var pc = document.createElement('span');
      pc.className = 'pc';
      pc.textContent = p.toFixed(2) + '%';

      li.appendChild(dot);
      li.appendChild(nm);
      li.appendChild(ct);
      li.appendChild(pc);
      statList.appendChild(li);
    });
    totalEl.textContent = '共 ' + state.pulls + ' 砖';
  }

  var busy = false;

  function setBusy(v) {
    busy = v;
    BTNS.forEach(function (b) { b.disabled = v; });
  }

  function draw(n) {
    if (busy) return;
    setBusy(true);

    var list = [];
    for (var i = 0; i < n; i++) list.push(rollOnce());

    renderResults(list);
    renderPity();
    renderStats();

    // 25 连的翻牌间隔要更短，不然等太久
    var stagger = n >= 25 ? 26 : 55;
    var wrap = stage.querySelector('.cards');
    if (wrap) {
      for (var j = 0; j < wrap.children.length; j++) {
        wrap.children[j].style.animationDelay = (j * stagger) + 'ms';
      }
    }
    setTimeout(function () { setBusy(false); }, 300 + n * stagger);

    var golds = list.filter(function (r) { return r.e.tier === '主皮肤'; });
    if (golds.length) queueReveal(golds);
  }

  // ---------------- 出金特写 ----------------
  var revealQueue = [];
  var revealBusy = false;

  function queueReveal(list) {
    revealQueue = revealQueue.concat(list);
    if (!revealBusy) showNextReveal();
  }

  // 把档位色往白里提一点，拿来当光晕/阴影色，这样每档的光都是自己的颜色
  function tintRgb(hex, k) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
    return r + ',' + g + ',' + b;
  }

  // 一张放大的卡片：出金特写和点开查看共用这一份
  function buildReveal(res, hintText) {
    var e = res.e;
    var tint = tintRgb(e.c1, 0.45);
    var ov = document.createElement('div');
    ov.className = 'reveal';

    var glow = document.createElement('div');
    glow.className = 'glow';
    glow.style.background = 'radial-gradient(circle, rgba(' + tint + ',.26), rgba(' + tint + ',.07) 40%, transparent 62%)';
    ov.appendChild(glow);

    var card = document.createElement('div');
    card.className = 'reveal-card';
    card.style.background = 'linear-gradient(160deg,' + e.c1 + ',' + e.c2 + ')';
    card.style.color = e.fg;
    card.style.boxShadow = '0 0 70px rgba(' + tint + ',.5), 0 20px 60px rgba(0,0,0,.6)';

    var t = document.createElement('div');
    t.className = 'tier';
    t.textContent = e.tier;
    card.appendChild(t);

    if (e.grade) {
      // 放大特写里只留「优品 / 极品」，成色字母挪到下面跟成色值放一起
      var qual = e.grade.replace(/\s*[SABC]\s*$/, '');
      var isTop = (qual === '极品');
      var g = document.createElement('div');
      g.className = 'qual' + (isTop ? ' top' : '');
      g.textContent = qual;
      card.appendChild(g);
      if (isTop) {
        card.classList.add('top');
        card.style.borderColor = 'rgba(' + tint + ',.85)';
        card.style.boxShadow = '0 0 90px rgba(' + tint + ',.6), 0 20px 60px rgba(0,0,0,.6)';
      }
    }

    if (res.wear != null) {
      var wEl = document.createElement('div');
      wEl.className = 'wear';
      wEl.textContent = '成色值 ' + res.wear.toFixed(2) + ' · ' + res.cond + ' 级';
      card.appendChild(wEl);
    }

    if (res.pull) {
      var pEl = document.createElement('div');
      pEl.className = 'pull';
      pEl.textContent = '第 ' + res.pull + ' 抽';
      card.appendChild(pEl);
    }

    if (res.pityHit) {
      var tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = '保底';
      card.appendChild(tag);
    }

    ov.appendChild(card);

    var hint = document.createElement('div');
    hint.className = 'reveal-hint';
    hint.textContent = hintText;
    ov.appendChild(hint);

    return ov;
  }

  function bindRevealClose(ov, after) {
    var opened = Date.now();
    function close() {
      if (Date.now() - opened < 420) return;
      ov.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
      ov.classList.add('out');
      setTimeout(function () {
        ov.remove();
        if (after) after();
      }, 220);
    }
    ov.addEventListener('click', close);
    document.addEventListener('keydown', close);
  }

  function showNextReveal() {
    var res = revealQueue.shift();
    if (!res) { revealBusy = false; return; }
    revealBusy = true;

    var ov = buildReveal(res, '点击任意位置继续');
    document.body.appendChild(ov);

    bindRevealClose(ov, function () {
      if (revealQueue.length) setTimeout(showNextReveal, 140);
      else revealBusy = false;
    });
  }

  // 点卡片回看这一件
  function openPreview(res) {
    if (revealBusy || document.querySelector('.reveal')) return;
    var ov = buildReveal(res, '点击任意位置关闭');
    document.body.appendChild(ov);
    bindRevealClose(ov, null);
  }

  btn1.addEventListener('click', function () { draw(1); });
  btn10.addEventListener('click', function () { draw(10); });
  btn25.addEventListener('click', function () { draw(25); });
  btnReset.addEventListener('click', function () {
    state = {
      pity: 0, pulls: 0,
      counts: { green: 0, blue: 0, purple: 0, main: 0 },
      mainGrades: {}, seg: 0, lastCycle: null, lastPityHit: false
    };
    stage.innerHTML = '<p class="hint">按「开砖」开始</p>';
    renderPity();
    renderStats();
  });

  renderPity();
  renderStats();
})();
