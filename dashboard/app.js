// Token Radar v3 — static dashboard. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view with the full valuation math and the farm plan,
// the live-token view, and the model with its comparables table. No network:
// every byte it shows is in data.js. State lives in the URL hash, so a
// board, a filter or a detail view is a link.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', sort: 'rank', selected: null };

  function readHash() {
    // Absent means default: a link that only names a protocol (#p=slug) is
    // a board link, not a stale tab from wherever the reader came from.
    state.tab = 'board'; state.q = ''; state.category = 'all';
    state.chain = 'all'; state.sort = 'rank'; state.selected = null;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var p = new URLSearchParams(hash);
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('q') !== null) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('p')) state.selected = p.get('p');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.tab !== 'board') p.set('tab', state.tab);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.sort !== 'rank') p.set('sort', state.sort);
    if (state.selected) p.set('p', state.selected);
    var h = p.toString();
    history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search);
  }
  readHash();
  // A link to a detail view, a filter or a tab must work when it arrives
  // after the page has loaded, not only on a fresh load.
  window.addEventListener('hashchange', function () { readHash(); render(); });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtFull(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : usd0.format(n); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function pctClass(n) { return n === null || n === undefined ? '' : n > 0 ? 'up' : n < 0 ? 'down' : ''; }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y (' + d + 'd)';
    return d + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clampGrowth(v) { return Math.min(40, Math.max(-40, v === null || v === undefined ? 0 : v)); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }

  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var comps = DATA.comparables || [];
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var categories = [...new Set(rows.map(function (r) { return r.category || 'Uncategorised'; }))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains || []; }))].sort();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var dir = -1;
    out.sort(function (a, b) {
      if (state.sort === 'implied') return (b.implied_value_usd - a.implied_value_usd) * 1 || a.rank - b.rank;
      if (state.sort === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (state.sort === 'growth') {
        var ga = a.change_7d === null ? -Infinity : a.change_7d;
        var gb = b.change_7d === null ? -Infinity : b.change_7d;
        return (gb - ga) * 1 || a.rank - b.rank;
      }
      return a.rank - b.rank;
    });
    return out;
  }

  function selectOptions(list, current, allLabel) {
    return [el('option', { value: 'all', text: allLabel })].concat(list.map(function (v) {
      return el('option', { value: v, text: v, selected: current === v ? 'selected' : null });
    }));
  }

  function render() {
    writeHash();
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var shell = el('div', { class: 'shell' });
    app.appendChild(shell);

    // Header
    shell.appendChild(el('div', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }),
        el('span', { class: 'brand-name', text: 'Token Radar · ' + DATA.model_version })),
      el('div', { class: 'top-meta' },
        el('span', { html: 'Snapshot <b>' + esc(DATA.as_of) + '</b>' }),
        el('span', { html: 'Source <b>DefiLlama · ' + esc(DATA.as_of) + '</b>' }),
        el('span', { html: 'Floor <b>' + fmtUsd(DATA.floor_usd) + '</b>' }))));
    shell.appendChild(el('div', { class: 'lede' },
      el('div', {},
        el('h1', { text: 'Pre-token protocols, ranked by implied value' }),
        el('p', { html: 'Every protocol on this board <strong>records no token yet</strong>. ' +
          'Implied value comes from the snapshot itself: TVL times a category multiple derived ' +
          'from live-token comparables, adjusted for 7-day growth, age with no token, chain ' +
          'breadth and scale. Click any row for the full maths and its farm plan.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Board' }), el('b', { text: DATA.board_size + ' protocols' })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' of ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: DATA.live_size + ' shown apart' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: rows.length ? fmtUsd(rows[0].implied_value_usd) : 'n/a' })))));

    // Tabs
    var tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Views' });
    [['board', 'Ranked board'], ['live', 'Live tokens'], ['model', 'Model & comparables']].forEach(function (t) {
      tabs.appendChild(el('button', {
        'aria-pressed': state.tab === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { state.tab = t[0]; state.selected = null; render(); }
      }));
    });
    shell.appendChild(tabs);

    if (state.tab === 'board') renderBoard(shell);
    else if (state.tab === 'live') renderLive(shell);
    else renderModel(shell);

    shell.appendChild(el('div', { class: 'foot' },
      el('span', { text: 'Token Radar ' + DATA.model_version + ' · DefiLlama · ' + DATA.as_of }),
      el('span', { text: 'Implied values are a model, not a market price. Nothing here is investment advice.' })));
  }

  function renderBoard(shell) {
    var list = filteredRows();
    var controls = el('div', { class: 'controls' });
    var qInput = el('input', {
      type: 'search', placeholder: 'Search name, slug or category…', value: state.q,
      'aria-label': 'Search protocols',
      oninput: function (e) { state.q = e.target.value; render(); }
    });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Search' }), qInput));
    var catSel = el('select', {
      'aria-label': 'Filter by category',
      onchange: function (e) { state.category = e.target.value; render(); }
    }, selectOptions(categories, state.category, 'All categories'));
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel));
    var chainSel = el('select', {
      'aria-label': 'Filter by chain',
      onchange: function (e) { state.chain = e.target.value; render(); }
    }, selectOptions(chains, state.chain, 'All chains'));
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel));
    var sortSel = el('select', {
      'aria-label': 'Sort by',
      onchange: function (e) { state.sort = e.target.value; render(); }
    });
    [['rank', 'Rank'], ['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day change']].forEach(function (o) {
      sortSel.appendChild(el('option', { value: o[0], text: o[1], selected: state.sort === o[0] ? 'selected' : null }));
    });
    controls.appendChild(el('div', { class: 'field' }, el('label', { text: 'Sort by' }), sortSel));
    controls.appendChild(el('span', { class: 'count', html: '<b>' + list.length + '</b> of ' + rows.length + ' shown' }));
    shell.appendChild(controls);

    var panel = el('div', { class: 'panel' });
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', {});
    var thead = el('thead', {});
    var hr = el('tr', {});
    [['Rank', 'rank'], ['Protocol', null], ['Category', null], ['Source', null], ['Chains', null], ['TVL', 'tvl'], ['7d', 'growth'], ['Implied value', 'implied']].forEach(function (h) {
      var attrs = { text: h[0] };
      if (h[0] === 'TVL' || h[0] === '7d' || h[0] === 'Implied value') attrs.class = 'num sortable';
      if (h[1]) attrs.onclick = function () { state.sort = h[1]; render(); };
      hr.appendChild(el('th', attrs));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody', {});
    if (list.length === 0) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '8', class: 'empty', text: 'No protocols match these filters.' })));
    }
    list.forEach(function (r) {
      var tr = el('tr', {
        'aria-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(); }
      });
      tr.appendChild(el('td', { class: 'rank' + (r.rank <= 3 ? ' top3' : ''), text: '#' + r.rank }));
      tr.appendChild(el('td', { class: 'name', html: '<b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="wl">Watchlist</span>' : '') + '<span>' + esc(r.slug) + '</span>' }));
      tr.appendChild(el('td', {}, el('span', { class: 'pill', text: r.category || 'Uncategorised' })));
      tr.appendChild(el('td', {}, el('span', { class: 'pill src-' + r.multiple_source, text: r.multiple_source })));
      tr.appendChild(el('td', { text: (r.chains || []).slice(0, 3).join(', ') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var g = el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) });
      tr.appendChild(g);
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    shell.appendChild(panel);

    var sel = state.selected ? bySlug[state.selected] : null;
    if (sel) renderDetail(shell, sel);
  }

  function renderDetail(shell, r) {
    // Recompute every multiplier from the raw snapshot figures at full
    // precision, the same arithmetic lib/model.ts runs, so the page's maths
    // reproduces board.json's implied value to the dollar. (The stored
    // multipliers are rounded to 4dp; recomputing from the raw inputs
    // avoids any rounding drift in the steps shown.)
    var growth = clampGrowth(r.change_7d);
    var growthMult = 1 + (growth / 100) * 0.6;
    var maturityMult = r.age_days === null
      ? 0.7
      : 0.7 + (Math.min(r.age_days, 1460) / 1460) * 0.3;
    var breadthMult = 1 + Math.min((r.chains || []).length, 12) * 0.015;
    var scaleMult = r.tvl_usd < 50000000 ? 0.95 : r.tvl_usd >= 250000000 ? 1.05 : 1.0;
    var base = r.tvl_usd * r.category_multiple;
    var afterGrowth = base * growthMult;
    var afterMaturity = afterGrowth * maturityMult;
    var afterBreadth = afterMaturity * breadthMult;
    var recomputed = Math.max(1, Math.round(afterBreadth * scaleMult));
    var fmtMult = function (n) { return n.toFixed(6); };
    var multNote = r.multiple_source === 'category'
      ? 'Median mcap / TVL of live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL'
      : r.multiple_source === 'shrunk'
      ? 'Median of live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL, shrunk toward the global median'
      : r.multiple_source === 'global'
      ? 'Global live median — too few live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL'
      : 'Default — no live protocols at all';
    var panel = el('div', { class: 'panel detail', id: 'detail' });
    panel.appendChild(el('div', { class: 'detail-head' },
      el('div', {},
        el('h2', { text: '#' + r.rank + ' ' + r.name }),
        el('div', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') + ' · records no token' })),
      el('button', { class: 'close', text: 'Close ×', onclick: function () { state.selected = null; render(); } })));
    var grid = el('div', { class: 'detail-grid' });
    var srcLabel = r.multiple_source === 'category' ? 'category median'
      : r.multiple_source === 'shrunk' ? 'shrunk blend'
      : r.multiple_source === 'global' ? 'global median' : 'default';
    var sampleLabel = r.multiple_samples === 0 ? 'no live samples'
      : r.multiple_samples + ' live sample' + (r.multiple_samples === 1 ? '' : 's');
    [['Implied value', fmtUsd(r.implied_value_usd)], ['TVL', fmtUsd(r.tvl_usd)],
     ['7-day change', fmtPct(r.change_7d)], ['Age with no token', fmtAge(r.age_days)],
     ['Category multiple · ' + srcLabel + ' · ' + sampleLabel, r.category_multiple.toFixed(4) + '×']].forEach(function (s) {
      grid.appendChild(el('div', { class: 'stat' }, el('b', { text: s[1] }), el('span', { text: s[0] })));
    });
    panel.appendChild(grid);

    var math = el('div', { class: 'math' }, el('h3', { text: 'Valuation, step by step' }));
    var mt = el('table', {});
    var rowsHtml = [
      ['TVL', fmtFull(r.tvl_usd), 'Snapshot TVL'],
      ['× category multiple (' + (r.category || 'Uncategorised') + ')', '× ' + r.category_multiple.toFixed(4), multNote],
      ['= base value', fmtFull(Math.round(base)), 'TVL × multiple'],
      ['× growth (' + (growth > 0 ? '+' : '') + growth + '% 7d, clamped ±40%)', '× ' + fmtMult(growthMult), '1 + growth / 100 × 0.6'],
      ['= after growth', fmtFull(Math.round(afterGrowth)), ''],
      ['× maturity (' + fmtAge(r.age_days) + ')', '× ' + fmtMult(maturityMult), '0.7 + min(age, 1460) / 1460 × 0.3'],
      ['= after maturity', fmtFull(Math.round(afterMaturity)), ''],
      ['× breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')', '× ' + fmtMult(breadthMult), '1 + min(chains, 12) × 0.015'],
      ['= after breadth', fmtFull(Math.round(afterBreadth)), ''],
      ['× scale (TVL ' + fmtUsd(r.tvl_usd) + ')', '× ' + scaleMult.toFixed(2), '0.95 below $50M · 1.00 from $50M · 1.05 at $250M+'],
      ['= implied value', fmtFull(r.implied_value_usd), 'Rounded to the dollar, at least $1'],
      ['Page recomputation', fmtFull(recomputed), recomputed === r.implied_value_usd ? 'Matches the implied value board.json carries.' : 'Does not match board.json — report this.'],
    ];
    rowsHtml.forEach(function (row) {
      mt.appendChild(el('tr', {},
        el('td', { text: row[0] }),
        el('td', { class: 'num', text: row[1] }),
        el('td', { class: 'formula', text: row[2] })));
    });
    math.appendChild(mt);

    var farm = el('div', { class: 'farm' }, el('h3', { text: 'Farm plan — what to do, what it costs, how long it takes' }));
    var ol = el('ol', {});
    (r.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    farm.appendChild(ol);
    // Valuation left, farm plan right at desktop width, so the whole detail
    // fits one 1440×900 frame; a single column again on narrow screens.
    panel.appendChild(el('div', { class: 'detail-body' }, math, farm));
    panel.appendChild(el('p', { class: 'note', text: 'The plan is derived from this protocol\u2019s category, chains, TVL and age — not from its name. Amounts are a starting size, not a recommendation; check the protocol\u2019s own page before depositing anything.' }));
    shell.appendChild(panel);
    setTimeout(function () {
      var d = document.getElementById('detail');
      if (d) d.scrollIntoView();
    }, 0);
  }

  function renderLive(shell) {
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'Live tokens — already trading, shown apart' }),
      el('p', { text: 'These protocols already have a token, so the board never ranks them. They are here at the market\u2019s own value — market cap, not a model — so the ranked board and the traded market can be compared side by side.' })));
    var panel = el('div', { class: 'panel' });
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', {});
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { class: 'num', text: 'TVL' }),
      el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Mcap / TVL' }), el('th', { class: 'num', text: '7d' }))));
    var tbody = el('tbody', {});
    live.forEach(function (r) {
      var ratio = r.tvl_usd > 0 && r.mcap_usd !== null ? r.mcap_usd / r.tvl_usd : null;
      var tr = el('tr', {});
      tr.appendChild(el('td', { class: 'name', html: '<b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span>' }));
      tr.appendChild(el('td', {}, el('span', { class: 'pill', text: r.category || 'Uncategorised' })));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num', text: ratio === null ? 'n/a' : ratio.toFixed(2) + '×' }));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    shell.appendChild(panel);
  }

  function renderModel(shell) {
    var m = DATA.model;
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'The model — derived from the snapshot, not from names' }),
      el('p', { html: 'Implied value = <strong>TVL × category multiple × growth × maturity × breadth × scale</strong>. ' +
        'The category multiple is the median market-cap / TVL of that category\u2019s live-token protocols in this same snapshot, ' +
        'counting only protocols with TVL at or above $50M. A category needs at least 3 such samples to trust its own median; ' +
        'with 1 or 2 the multiple is shrunk toward the global live median (' +
        (DATA.global_median === null ? 'n/a' : DATA.global_median.toFixed(4)) + '), weighted 3; with none it takes the global median outright. ' +
        'No protocol name is ever special-cased.' })));
    var grid = el('div', { class: 'model-grid' });
    [
      ['Growth', '7-day change clamped to ±40%, weight 0.6 — a one-week wiggle cannot double a value.'],
      ['Maturity', '0.7 + min(age, 1460 days) / 1460 × 0.3. Older with no token = more proved, slightly more valuable.'],
      ['Breadth', '1 + min(chains, 12) × 0.015. More chains, slightly more reach.'],
      ['Scale', '0.95 below $50M TVL · 1.00 from $50M · 1.05 at $250M+.'],
      ['Multiple clamp', 'Every category multiple is clamped to [0.05, 3].'],
      ['Fallback', '1 or 2 samples → shrunk blend toward the global median (weight 3); no samples → global median; no live protocols at all → 0.25.'],
    ].forEach(function (c) {
      grid.appendChild(el('div', { class: 'model-card' }, el('b', { text: c[0] }), el('span', { text: c[1] })));
    });
    shell.appendChild(grid);

    var ownCount = comps.filter(function (c) { return c.source === 'category'; }).length;
    var shrunkCount = comps.filter(function (c) { return c.source === 'shrunk'; }).length;
    var globalCount = comps.filter(function (c) { return c.source === 'global'; }).length;
    var zeroCount = comps.filter(function (c) { return c.samples === 0; }).length;
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'Comparables — every category\u2019s multiple' }),
      el('p', { text: ownCount + ' categories use their own median, ' + shrunkCount + ' use the shrunk blend, and ' + globalCount + ' fall back to the global median — ' + zeroCount + ' of those have no eligible live comparables at all.' }),
      el('p', { text: 'Source “category” means the category\u2019s own median from its live protocols at $50M+ TVL; “shrunk” means 1 or 2 samples blended toward the global median; “global” means the category had no eligible live samples and takes the global live median; “default” would mean no live protocols at all. Rows are ordered by sample count, most first.' })));
    // Most samples first, so the categories that stand on their own median lead.
    var sortedComps = comps.slice().sort(function (a, b) {
      if (b.samples !== a.samples) return b.samples - a.samples;
      if (a.category === null) return 1;
      if (b.category === null) return -1;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    });
    var panel = el('div', { class: 'panel' });
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', {});
    table.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Multiple' }),
      el('th', { class: 'num', text: 'Raw median' }), el('th', { class: 'num', text: 'Live samples' }), el('th', { text: 'Source' }))));
    var tbody = el('tbody', {});
    sortedComps.forEach(function (c) {
      var tr = el('tr', {});
      tr.appendChild(el('td', { text: c.category || 'Uncategorised' }));
      tr.appendChild(el('td', { class: 'num', text: c.multiple.toFixed(4) + '×' }));
      tr.appendChild(el('td', { class: 'num', text: c.raw_median === null ? 'n/a' : c.raw_median.toFixed(4) + '×' }));
      tr.appendChild(el('td', { class: 'num', text: String(c.samples) }));
      tr.appendChild(el('td', {}, el('span', { class: 'pill', text: c.source })));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    shell.appendChild(panel);
  }

  render();
})();
