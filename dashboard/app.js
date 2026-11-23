// Token Radar v5 — static dashboard. Reads window.RADAR and renders the
// ranked board, a filterable table, a per-protocol detail view, the
// live-token view, and the model with its fit, odds and comparables. No
// network: every byte it shows is in data.js. State lives in the URL hash.
// v5 ranks by EXPECTED value (implied x launch odds). The detail view
// recomputes the valuation from the raw figures, the same arithmetic
// lib/model.ts runs, so it reproduces board.json to the dollar.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', sort: 'rank', selected: null };

  function readHash() {
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
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(1) + '%';
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
  // Flag a row: a one-week move over 30%, or no listing date at all.
  function flagReason(r) {
    if (r.change_7d !== null && Math.abs(r.change_7d) > 30) return '7-day move over 30%';
    if (r.age_days === null || r.age_days === undefined) return 'listing date unknown';
    return null;
  }

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
    out.sort(function (a, b) {
      if (state.sort === 'expected') return (b.expected_value_usd - a.expected_value_usd) || a.rank - b.rank;
      if (state.sort === 'implied') return (b.implied_value_usd - a.implied_value_usd) || a.rank - b.rank;
      if (state.sort === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (state.sort === 'growth') {
        var ga = a.change_7d === null ? -Infinity : a.change_7d;
        var gb = b.change_7d === null ? -Infinity : b.change_7d;
        return (gb - ga) || a.rank - b.rank;
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
        el('h1', { text: 'Pre-token protocols, ranked by expected value' }),
        el('p', { html: 'Every protocol on this board <strong>records no token yet</strong>. ' +
          'Expected value is the implied value times the chance it ever launches a token. Implied value comes from the snapshot itself: TVL times a category multiple from ' +
          'live-token comparables, adjusted for 7-day growth, chain breadth and a fitted scale term. ' +
          'The launch odds come from the peers\u2019 own record. Click any row for the full maths and its farm plan.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Board' }), el('b', { text: DATA.board_size + ' protocols' })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' of ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: DATA.live_size + ' shown apart' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top expected value' }), el('b', { text: rows.length ? fmtUsd(rows[0].expected_value_usd) : 'n/a' })))));

    // Integrity strip: what was excluded, what falls back, what was checked.
    var globalCount = comps.filter(function (c) { return c.source === 'global'; }).length;
    var flaggedCount = rows.filter(function (r) { return flagReason(r) !== null; }).length;
    shell.appendChild(el('div', { class: 'strip' },
      el('span', { html: 'Integrity: <b>' + DATA.excluded_zero_mcap + ' live protocols with a $0 or negative market cap excluded</b> from the comparables · ' +
        '<b>' + globalCount + ' of ' + comps.length + ' categories on the global median</b> · DefiLlama ' + esc(DATA.as_of) + ' · ' +
        'checks: watchlist ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ', ranks 1–' + DATA.board_size + ', two runs byte-identical, exclusions applied · ' +
        flaggedCount + ' rows flagged.' })));

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
      el('span', { text: 'Expected values are a model, not a market price. Nothing here is investment advice.' })));
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
    [['rank', 'Rank'], ['expected', 'Expected value'], ['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7-day change']].forEach(function (o) {
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
    [['Rank', 'rank'], ['Protocol', null], ['Category', null], ['Source', null], ['TVL', 'tvl'], ['7d', 'growth'], ['Implied value', 'implied'], ['Odds', null], ['Expected value', 'expected'], ['Verdict', null]].forEach(function (h) {
      var attrs = { text: h[0] };
      if (h[0] === 'TVL' || h[0] === '7d' || h[0] === 'Implied value' || h[0] === 'Odds' || h[0] === 'Expected value') attrs.class = 'num sortable';
      if (h[1]) attrs.onclick = function () { state.sort = h[1]; render(); };
      hr.appendChild(el('th', attrs));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody', {});
    if (list.length === 0) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '10', class: 'empty', text: 'No protocols match these filters.' })));
    }
    list.forEach(function (r) {
      var tr = el('tr', {
        'aria-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { state.selected = state.selected === r.slug ? null : r.slug; render(); }
      });
      tr.appendChild(el('td', { class: 'rank' + (r.rank <= 3 ? ' top3' : ''), text: '#' + r.rank }));
      var flag = flagReason(r);
      tr.appendChild(el('td', { class: 'name', html: '<b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="wl">Watchlist</span>' : '') + (flag ? '<span class="flag-mark" title="Flagged: ' + esc(flag) + '">⚑</span>' : '') + '<span>' + esc(r.slug) + '</span>' }));
      tr.appendChild(el('td', {}, el('span', { class: 'pill', text: r.category || 'Uncategorised' })));
      tr.appendChild(el('td', {}, el('span', { class: 'pill src-' + r.multiple_source, text: r.multiple_source })));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtOdds(r.odds) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.expected_value_usd) }));
      tr.appendChild(el('td', {}, el('span', { class: 'pill verdict-' + r.farm_verdict, text: r.farm_verdict })));
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
    // Recompute from the raw figures at full precision, the same
    // arithmetic lib/model.ts runs, so the maths reproduces board.json
    // to the dollar. (Stored multipliers are rounded to 4dp.)
    var m = DATA.model;
    var growth = clampGrowth(r.change_7d);
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var breadthMult = 1 + Math.min((r.chains || []).length, m.breadth_max_chains) * m.breadth_per_chain;
    var logTvl = Math.max(m.scale_log_min, Math.min(m.scale_log_max, Math.log(r.tvl_usd / m.scale_floor_tvl)));
    var scaleMult = Math.exp(m.scale_coefficient * logTvl);
    var base = r.tvl_usd * r.category_multiple;
    var afterGrowth = base * growthMult;
    var afterBreadth = afterGrowth * breadthMult;
    var recomputed = Math.max(1, Math.round(afterBreadth * scaleMult));
    var recomputedExpected = Math.max(1, Math.round(recomputed * r.odds));
    var fmtMult = function (n) { return n.toFixed(6); };
    var multNote = r.multiple_source === 'category'
      ? 'Median mcap / TVL of live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL'
      : r.multiple_source === 'shrunk'
      ? 'Median of live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL, shrunk toward the global median'
      : r.multiple_source === 'global'
      ? 'Global live median — too few live ' + (r.category || 'uncategorised') + ' protocols at $50M+ TVL'
      : 'Default — no live protocols at all';
    var cash = (r.farm_capital_usd || 0) + (r.farm_fees_usd || 0);
    var flag = flagReason(r);
    var panel = el('div', { class: 'panel detail', id: 'detail' });
    panel.appendChild(el('div', { class: 'detail-head' },
      el('div', {},
        el('h2', { text: '#' + r.rank + ' ' + r.name }),
        el('div', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Uncategorised') + ' · ' + (r.chains || []).join(', ') + ' · records no token' + (flag ? ' · flagged: ' + flag : '') })),
      el('button', { class: 'close', text: 'Close ×', onclick: function () { state.selected = null; render(); } })));
    var grid = el('div', { class: 'detail-grid' });
    var srcLabel = r.multiple_source === 'category' ? 'category median'
      : r.multiple_source === 'shrunk' ? 'shrunk blend'
      : r.multiple_source === 'global' ? 'global median' : 'default';
    var sampleLabel = r.multiple_samples === 0 ? 'no live samples'
      : r.multiple_samples + ' live sample' + (r.multiple_samples === 1 ? '' : 's');
    [['Expected value', fmtUsd(r.expected_value_usd)],
     ['Implied value', fmtUsd(r.implied_value_usd)],
     ['Launch odds', fmtOdds(r.odds)],
     ['Farm verdict', r.farm_verdict],
     ['Cash to farm', fmtUsd(cash)]].forEach(function (s) {
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
      ['× breadth (' + (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's') + ')', '× ' + fmtMult(breadthMult), '1 + min(chains, 12) × 0.015'],
      ['= after breadth', fmtFull(Math.round(afterBreadth)), ''],
      ['× scale (TVL ' + fmtUsd(r.tvl_usd) + ')', '× ' + fmtMult(scaleMult), 'exp(−0.36 × clamp(log(TVL/$50M), −2, 4)) — fitted'],
      ['= implied value', fmtFull(r.implied_value_usd), 'Rounded to the dollar, at least $1'],
      ['× launch odds (' + fmtAge(r.age_days) + ' with no token)', '× ' + fmtOdds(r.odds), 'Conditional chance from the age-bucket survival curve'],
      ['= expected value', fmtFull(r.expected_value_usd), 'The ranked value: implied × odds'],
      ['Page recomputation', fmtFull(recomputedExpected), recomputedExpected === r.expected_value_usd ? 'Matches the expected value board.json carries.' : 'Does not match board.json — report this.'],
    ];
    rowsHtml.forEach(function (row) {
      mt.appendChild(el('tr', {},
        el('td', { text: row[0] }),
        el('td', { class: 'num', text: row[1] }),
        el('td', { class: 'formula', text: row[2] })));
    });
    math.appendChild(mt);

    var farm = el('div', { class: 'farm' }, el('h3', { text: 'Farm plan — what to do, what it costs, how long it takes' }));
    farm.appendChild(el('p', { class: 'farm-totals', text: 'Cash $' + Math.round(cash).toLocaleString('en-US') + ' ($' + Math.round(r.farm_capital_usd || 0) + ' capital, $' + Math.round(r.farm_fees_usd || 0) + ' fees) · ' + (r.farm_time_minutes || 0) + ' minutes active · hold ' + (r.farm_hold_days || 0) + ' days · verdict ' + r.farm_verdict }));
    var ol = el('ol', {});
    (r.farm_steps || []).forEach(function (s) { ol.appendChild(el('li', { text: s })); });
    farm.appendChild(ol);
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
      el('p', { text: 'These protocols already have a token, so the board never ranks them. They are here at the market\u2019s own value — market cap, not a model.' })));
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
      var ratioCell = ratio === null ? 'n/a' : ratio.toFixed(2) + '×';
      // A ratio over 10× is a data artefact, not a valuation: a market
      // cap dwarfing its TVL, far below the $50M comparables floor.
      if (ratio !== null && ratio > 10) ratioCell = ratio.toFixed(1) + '× ⚑ artefact';
      tr.appendChild(el('td', { class: 'num' + (ratio !== null && ratio > 10 ? ' flag' : ''), text: ratioCell }));
      tr.appendChild(el('td', { class: 'num ' + pctClass(r.change_7d), text: fmtPct(r.change_7d) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    panel.appendChild(wrap);
    shell.appendChild(panel);
    shell.appendChild(el('p', { class: 'note', text: '⚑ artefact: Rain records a $2.65B market cap on $6.6M TVL — a 400× ratio — below the $50M comparables floor. It never enters the comparables. Any Mcap / TVL over 10× here is the same kind of artefact, not a valuation.' }));
  }

  function renderModel(shell) {
    var m = DATA.model;
    var f = DATA.fit;
    var curve = DATA.odds_curve;
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'The model — fitted, not hand-picked' }),
      el('p', { html: 'Expected value = <strong>implied value × launch odds</strong>. Implied value = <strong>TVL × category multiple × growth × breadth × scale</strong>. ' +
        'The category multiple is the median market-cap / TVL of that category\u2019s live-token protocols at $50M+ TVL with a positive market cap — 3 samples to trust its own median, 1 or 2 shrunk toward the global live median (' +
        (DATA.global_median === null ? 'n/a' : DATA.global_median.toFixed(4)) + '), none takes the global median outright. ' +
        'The launch odds are the conditional chance a protocol ever launches a token, from the age-bucket survival curve below. ' +
        'No protocol name is ever special-cased.' })));
    var grid = el('div', { class: 'model-grid' });
    [
      ['Growth', '7-day change clamped to ±40%, weight 0.6. Kept hand-picked: the fitted coefficient is unstable across splits.'],
      ['Maturity: flat', 'Age carries no weight in the multiple — the fitted age coefficient is negative in 6 of 7 held-out fits. Age acts through the launch odds.'],
      ['Breadth', '1 + min(chains, 12) × 0.015.'],
      ['Scale: fitted', 'exp(−0.36 × clamp(log(TVL / $50M), −2, 4)). The multiple falls as TVL rises; value grows like TVL^0.64.'],
      ['Multiple clamp', 'Every category multiple is clamped to [0.05, 3].'],
      ['Fallback', '1 or 2 samples → shrunk blend toward the global median (weight 3); no samples → global median; none at all → 0.25. A $0 market cap is a missing price, not a valuation, so those protocols are excluded.'],
    ].forEach(function (c) {
      grid.appendChild(el('div', { class: 'model-card' }, el('b', { text: c[0] }), el('span', { text: c[1] })));
    });
    shell.appendChild(grid);

    // The fit, held out.
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'The fit — tested held-out, twice over' }),
      el('p', { text: 'log(mcap / TVL) was regressed on the snapshot\u2019s ' + f.live_fit_n + ' live protocols with a positive market cap, and every term was tested held-out on seven splits: one walk-forward by listing date, one random 80/20, and five cross-validation folds. The figures are the seven-split mean. The full fitted OLS is not shipped — unstable, and it loses to the minimal change on every split.' })));
    var fitPanel = el('div', { class: 'panel' });
    var fitWrap = el('div', { class: 'table-wrap' });
    var fitTable = el('table', {});
    fitTable.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Model' }), el('th', { class: 'num', text: 'Held-out RMSE (log ratio)' }), el('th', { class: 'num', text: 'Held-out Spearman' }))));
    var fitBody = el('tbody', {});
    [['v4 hand-picked (step scale, age rewarded)', f.held_out_rmse_v4, f.held_out_spearman_v4],
     ['TVL × category median only', f.held_out_rmse_baseline, f.held_out_spearman_baseline],
     ['Full fitted OLS (all terms fitted)', f.held_out_rmse_full_ols, f.held_out_spearman_full_ols],
     ['v5 — fitted scale + flat maturity', f.held_out_rmse_v5, f.held_out_spearman_v5]].forEach(function (row) {
      fitBody.appendChild(el('tr', {},
        el('td', { text: row[0] }),
        el('td', { class: 'num', text: row[1].toFixed(2) }),
        el('td', { class: 'num', text: row[2].toFixed(2) })));
    });
    fitTable.appendChild(fitBody);
    fitWrap.appendChild(fitTable);
    fitPanel.appendChild(fitWrap);
    shell.appendChild(fitPanel);

    // The launch odds.
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'Launch odds — the chance a protocol ever launches a token' }),
      el('p', { text: 'The fraction of protocols that record a token rises with age and plateaus near ' + (curve.plateau_rate * 100).toFixed(1) + '%. A protocol that has not launched by age N is not the average of its cohort: its odds are the share of the eventual launchers that has not launched yet, (plateau − rate) / (1 − rate). That chance falls with age — young protocols keep most of their chance, a protocol listed three years ago with no token has almost used up its window. Odds are floored at 5%.' })));
    var oddsPanel = el('div', { class: 'panel' });
    var oddsWrap = el('div', { class: 'table-wrap' });
    var oddsTable = el('table', {});
    oddsTable.appendChild(el('thead', {}, el('tr', {},
      el('th', { text: 'Age' }), el('th', { class: 'num', text: 'Protocols' }), el('th', { class: 'num', text: 'With token' }),
      el('th', { class: 'num', text: 'Rate' }), el('th', { class: 'num', text: 'Odds' }))));
    var oddsBody = el('tbody', {});
    curve.buckets.forEach(function (b) {
      var label = b.age_max_days === null
        ? Math.floor(b.age_min_days / 365) + 'y+'
        : b.age_min_days === 0 ? '<' + b.age_max_days + 'd' : b.age_min_days + '–' + b.age_max_days + 'd';
      oddsBody.appendChild(el('tr', {},
        el('td', { text: label }),
        el('td', { class: 'num', text: String(b.protocols) }),
        el('td', { class: 'num', text: String(b.with_token) }),
        el('td', { class: 'num', text: (b.rate * 100).toFixed(1) + '%' }),
        el('td', { class: 'num', text: (b.odds * 100).toFixed(1) + '%' })));
    });
    oddsBody.appendChild(el('tr', {},
      el('td', { text: 'Age unknown' }),
      el('td', { class: 'num', text: '—' }),
      el('td', { class: 'num', text: '—' }),
      el('td', { class: 'num', text: '—' }),
      el('td', { class: 'num', text: (curve.unknown_age_odds * 100).toFixed(1) + '%' })));
    oddsTable.appendChild(oddsBody);
    oddsWrap.appendChild(oddsTable);
    oddsPanel.appendChild(oddsWrap);
    shell.appendChild(oddsPanel);

    var ownCount = comps.filter(function (c) { return c.source === 'category'; }).length;
    var shrunkCount = comps.filter(function (c) { return c.source === 'shrunk'; }).length;
    var globalCount = comps.filter(function (c) { return c.source === 'global'; }).length;
    var zeroCount = comps.filter(function (c) { return c.samples === 0; }).length;
    shell.appendChild(el('div', { class: 'section' },
      el('h2', { text: 'Comparables — every category\u2019s multiple' }),
      el('p', { text: ownCount + ' categories use their own median, ' + shrunkCount + ' use the shrunk blend, and ' + globalCount + ' fall back to the global median — ' + zeroCount + ' of those have no eligible live comparables at all. ' + DATA.excluded_zero_mcap + ' live protocols with a $0 or negative market cap are excluded entirely.' }),
      el('p', { text: '“category” means the category\u2019s own median from its live protocols at $50M+ TVL; “shrunk” means 1 or 2 samples blended toward the global median; “global” means no eligible live samples; “default” would mean no live protocols at all. Rows are ordered by sample count, most first.' })));
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
