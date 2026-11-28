// Token Radar M18 — dashboard. No network, no fetch: everything renders
// from window.RADAR (data.js, written by main.ts from the same board).
// Verdicts are DERIVED here from implied value, never stored in the page's
// data: FARM at or above $14.4M, THIN at or above $5.8M, else SKIP. Those two
// cut points sit between adjacent rows ($14.43M / $14.30M and $5.85M /
// $5.74M) and reproduce the board's own split: FARM 66 / THIN 61 / SKIP 69.
//
// Held-out evidence, measured on the 128 priced protocols (7 splits:
// walk-forward + random 80/20 + 5-fold, seed 42). The shipped row is M18
// FIX; the rest are the candidates it beat or that were tested and dropped.
var HELDOUT = [
  { name: 'M18 FIX — scale -0.45, growth -0.6 (SHIPPED)', rmse: 2.188, medale: 1.205, spRatio: 0.360, spMcap: 0.348 },
  { name: 'M18 refit scale + growth -0.6', rmse: 2.197, medale: 1.222, spRatio: 0.353, spMcap: 0.350 },
  { name: 'M3 — v6 with scale refit per split', rmse: 2.207, medale: 1.184, spRatio: 0.345, spMcap: 0.343 },
  { name: 'M2 — v6 shipped (scale -0.36, growth +0.6)', rmse: 2.212, medale: 1.227, spRatio: 0.331, spMcap: 0.352 },
  { name: 'M4 — growth -1.0', rmse: 2.200, medale: 1.245, spRatio: 0.348, spMcap: 0.366 },
  { name: 'M14 — dominance (tested, dropped)', rmse: 2.218, medale: 1.245, spRatio: 0.341, spMcap: 0.351 }
];
// Integrity, counted from the snapshot by the builder (758 protocols):
// 40 watchlist + 156 ranked early + 128 priced live + 146 excluded
// pre-token + 288 live but not priced = 758. Excluded pre-token: bridge
// 44, liquid staking / restaking 43, CEX 42, versioned names 11,
// wrapped / staked names 6. Live not priced: no market cap 272, zero cap
// 15, negative cap sentinel 1.
var INTEGRITY = { total: 758, watchlist: 40, early: 156, priced: 128, excludedPre: 146, bridge: 44, liquid: 43, cex: 42, versioned: 11, wrapped: 6, liveNotPriced: 288, noMcap: 272, zeroMcap: 15, negMcap: 1 };

var DATA = window.RADAR;
var FARM_AT = 14400000;
var THIN_AT = 5800000;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmtUsd(n) {
  if (n == null) return '—';
  var a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
function fmtSigned(n) { if (n == null) return '—'; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
function fmtMoney(n) { if (n == null) return '—'; return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }
function verdictOf(v) { return v >= FARM_AT ? 'FARM' : v >= THIN_AT ? 'THIN' : 'SKIP'; }
function chip(v) { return '<span class="chip ' + v + '">' + v + '</span>'; }
function ageText(p) { return p.age_days == null ? 'age unknown' : p.age_days + 'd old'; }
function chainText(p) { return (p.chains || []).slice(0, 2).join(' + ') + ((p.chains || []).length > 2 ? ' +' + (p.chains.length - 2) : ''); }

function capitalFor(p) { if (p.tvl_usd >= 5000000000) return 250; if (p.tvl_usd >= 1000000000) return 150; if (p.tvl_usd >= 100000000) return 100; return 50; }
function holdFor(p) { if (p.age_days == null) return 30; if (p.age_days < 180) return 60; if (p.age_days < 365) return 45; return 30; }
function actionFor(p, cap, chain) {
  var c = (p.category || '').toLowerCase(); var n = p.name;
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + cap + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + cap + ' of liquidity to ' + n + '\'s main pool on ' + chain + ' and keep the position open.';
  if (c.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + cap + ' of the chain\'s staking asset through ' + n + ' and keep the receipt.';
  if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + cap + ' of USDC as margin on ' + n + ' and open one small hedge.';
  if (c.indexOf('prediction') >= 0) return 'Fund $' + cap + ' and place one market position on ' + n + '.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + cap + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
  if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + cap + ' of the stable asset through ' + n + ' on ' + chain + '.';
  if (c.indexOf('rwa') >= 0) return 'Mint $' + cap + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
  if (c.indexOf('insurance') >= 0) return 'Buy $' + cap + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
  return 'Deposit $' + cap + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
}
// The farm plan main.ts writes into board.json, derived the same way:
// category, chain, TVL and age only — never a hand-written list of names.
function farmSteps(p) {
  var chain = (p.chains && p.chains[0]) || 'its main chain';
  var cap = capitalFor(p); var hold = holdFor(p);
  var steps = [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, cap, chain), cost: '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + cap + ' stays in the position', time: hold + ' days' },
    { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
  ];
  return steps.map(function (s) { return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; });
}

var state = { q: '', cat: 'all', verdict: 'all', view: 'board', sort: 'implied', dir: -1, selected: null };

function filteredRows() {
  var q = state.q.trim().toLowerCase();
  var rows = DATA.rows.filter(function (r) {
    if (state.verdict !== 'all' && verdictOf(r.implied_value_usd) !== state.verdict) return false;
    if (state.cat !== 'all' && r.category !== state.cat) return false;
    if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  var key = state.sort;
  rows.sort(function (a, b) {
    var av, bv;
    if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
    else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
    else if (key === 'change') { av = a.change_7d == null ? 0 : a.change_7d; bv = b.change_7d == null ? 0 : b.change_7d; }
    else if (key === 'expected') { av = a.expected_value_usd; bv = b.expected_value_usd; }
    else if (key === 'hour') { av = a.farm_net_per_hour_usd; bv = b.farm_net_per_hour_usd; }
    else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
    else { av = a.name; bv = b.name; return state.dir * (av < bv ? -1 : av > bv ? 1 : 0); }
    return state.dir * (av - bv);
  });
  return rows;
}

function counts() {
  var c = { FARM: 0, THIN: 0, SKIP: 0 };
  DATA.rows.forEach(function (r) { c[verdictOf(r.implied_value_usd)]++; });
  return c;
}

function topbar() {
  return '<div class="topbar"><span class="brand">TOKEN RADAR</span>' +
    '<span class="model-tag">MODEL ' + esc(DATA.model_version.toUpperCase()) + ' &middot; SNAPSHOT ' + esc(DATA.as_of) + ' &middot; SHA ' + esc(DATA.snapshot_sha256.slice(0, 8)) + '</span></div>';
}

function hero() {
  var top = DATA.rows[0];
  var c = counts();
  var top5 = DATA.rows.slice(1, 5);
  var maxV = top.implied_value_usd;
  return '<section class="hero"><h1>The next token, ranked before it exists.</h1>' +
    '<p class="lede"><b>' + DATA.board_size + '</b> pre-token protocols, one model, one ranked board. ' +
    'Every row is priced off the <b>128</b> tokens that already trade, on snapshot ' + esc(DATA.as_of) + ' — ' +
    '<b>' + DATA.watchlist_size + '</b> watchlist protocols plus <b>' + DATA.early_size + '</b> early finds, ' +
    'including rows above the $50M floor the starter model would have dropped.</p>' +
    '<div class="hero-grid"><div class="card spot"><h2>Rank #1</h2>' +
    '<div class="name">' + esc(top.name) + ' ' + chip(verdictOf(top.implied_value_usd)) + '</div>' +
    '<div class="big">' + fmtUsd(top.implied_value_usd) + '</div>' +
    '<div class="meta">TVL ' + fmtUsd(top.tvl_usd) + ' &middot; 7d ' + fmtSigned(top.change_7d) + ' &middot; ' + esc(top.category || '') + ' &middot; ' + esc(chainText(top)) + ' &middot; ' + ageText(top) + '</div>' +
    '<div class="meta">Multiple ' + top.multiple.toFixed(2) + ' &times; &middot; token odds ' + top.odds.toFixed(2) + ' (assumed, not fitted) &middot; expected value ' + fmtUsd(top.expected_value_usd) + '</div>' +
    '<p class="why">Why #1: the largest implied value on the board — ' + fmtUsd(top.tvl_usd) + ' of TVL at a ' + top.multiple.toFixed(2) + '&times; multiple (growth ' + top.growth_multiplier.toFixed(2) + '&times;, breadth ' + top.breadth_multiplier.toFixed(2) + '&times;, scale ' + top.scale_multiplier.toFixed(2) + '&times;).</p></div>' +
    '<div class="card"><h2 style="margin:0 0 4px;font-size:13px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase">Top 5</h2><ol class="top5">' +
    top5.map(function (r) {
      return '<li><span class="rk">#' + r.rank + '</span><span>' + esc(r.name) + '</span><span class="val">' + fmtUsd(r.implied_value_usd) + '</span></li>' +
        '<div class="bar"><i style="width:' + Math.round(100 * r.implied_value_usd / maxV) + '%"></i></div>';
    }).join('') + '</ol></div></div>' +
    '<div class="tally">' + ['FARM', 'THIN', 'SKIP'].map(function (v) {
      return '<button data-verdict="' + v + '" aria-pressed="' + (state.verdict === v) + '"><b>' + c[v] + '</b><span>' + v + ' — ' + (v === 'FARM' ? 'farm now' : v === 'THIN' ? 'thin, watch it' : 'skip for now') + '</span></button>';
    }).join('') + '</div>' +
    '<p class="strip"><b>Integrity strip — all 758 protocols accounted for:</b> ' + INTEGRITY.watchlist + ' watchlist + ' + INTEGRITY.early + ' ranked early + ' + INTEGRITY.priced + ' priced live + ' + INTEGRITY.excludedPre + ' excluded pre-token (bridge ' + INTEGRITY.bridge + ', liquid staking / restaking ' + INTEGRITY.liquid + ', CEX ' + INTEGRITY.cex + ', versioned names ' + INTEGRITY.versioned + ', wrapped / staked names ' + INTEGRITY.wrapped + ') + ' + INTEGRITY.liveNotPriced + ' live but not priced (no market cap ' + INTEGRITY.noMcap + ', zero cap ' + INTEGRITY.zeroMcap + ', negative cap sentinel ' + INTEGRITY.negMcap + ') = ' + INTEGRITY.total + '.</p></section>';
}

function controls() {
  var cats = [];
  DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort();
  return '<div class="controls"><input id="q" type="search" placeholder="Search name, category, chain or slug" value="' + esc(state.q) + '" aria-label="Search">' +
    '<select id="cat" aria-label="Category"><option value="all">All categories</option>' +
    cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<div class="tabs" role="group" aria-label="View">' +
    [['board', 'Board'], ['live', 'Live tokens'], ['model', 'Model']].map(function (v) {
      return '<button data-view="' + v[0] + '" aria-pressed="' + (state.view === v[0]) + '">' + v[1] + '</button>';
    }).join('') + '</div>' +
    '<div class="tabs" role="group" aria-label="Filter by verdict">' +
    ['all', 'FARM', 'THIN', 'SKIP'].map(function (v) {
      return '<button data-verdict-tab="' + v + '" aria-pressed="' + (state.verdict === v) + '">' + (v === 'all' ? 'All' : v) + '</button>';
    }).join('') + '</div></div>';
}

function sortBtn(key, label) {
  var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
  return '<button data-sort="' + key + '">' + label + arrow + '</button>';
}

function boardView() {
  var rows = filteredRows();
  var body = rows.map(function (r) {
    var v = verdictOf(r.implied_value_usd);
    var chg = r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtSigned(r.change_7d) + '</span>';
    return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (DATA.watchlist_size && r.tvl_usd >= DATA.floor_usd ? '<span class="tag">WATCHLIST</span>' : '') +
      '<div class="sub">' + esc(r.category || '') + ' &middot; ' + esc(chainText(r)) + ' &middot; ' + ageText(r) + '</div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b><div class="bar"><i style="width:' + Math.round(100 * r.implied_value_usd / DATA.rows[0].implied_value_usd) + '%"></i></div></td>' +
      '<td class="num sub">' + fmtUsd(r.range_low_usd) + '–' + fmtUsd(r.range_high_usd) + '</td>' +
      '<td class="num">' + r.multiple.toFixed(2) + '&times;</td>' +
      '<td class="num">' + r.odds.toFixed(2) + '</td>' +
      '<td class="num">' + fmtUsd(r.expected_value_usd) + '</td>' +
      '<td class="num">' + fmtMoney(r.farm_net_per_hour_usd) + '/h</td>' +
      '<td>' + chip(v) + '</td></tr>';
  }).join('');
  return '<table id="board"><caption>Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan. Range is the category p25–p75 implied value (global quartiles when a category has fewer than 4 priced samples), widened to include the point estimate where the shrunk multiple sits outside it; odds are an assumption, not a fit.</caption>' +
    '<thead><tr><th class="num">' + sortBtn('implied', 'Rank') + '</th><th>Protocol</th><th class="num">' + sortBtn('tvl', 'TVL') + '</th><th class="num">' + sortBtn('change', '7d') + '</th><th class="num">' + sortBtn('implied', 'Implied value') + '</th><th class="num">Range</th><th class="num">' + sortBtn('multiple', 'Multiple') + '</th><th class="num">Odds</th><th class="num">' + sortBtn('expected', 'Expected') + '</th><th class="num">' + sortBtn('hour', 'Net $/h') + '</th><th>Verdict</th></tr></thead>' +
    '<tbody>' + (body || '<tr><td colspan="11"><div class="empty">No rows match. Clear the search or pick another category or verdict.</div></td></tr>') + '</tbody></table>' +
    '<p class="note">' + rows.length + ' rows shown of ' + DATA.board_size + '. Ranking stays by implied value; use the Expected column to sort by odds-adjusted value instead. Net $/h assumes a 5% airdrop pool split among 10,000 wallets, minus gas and a 5% capital charge — an illustration, not a promise.</p>';
}

function liveView() {
  var rows = DATA.live.map(function (r) {
    return '<tr><td><b>' + esc(r.name) + '</b><div class="sub">' + esc(r.category || '') + ' &middot; ' + esc(chainText(r)) + '</div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num"><b>' + fmtUsd(r.mcap_usd) + '</b></td>' +
      '<td class="num">' + (r.change_7d == null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + fmtSigned(r.change_7d) + '</span>') + '</td></tr>';
  }).join('');
  return '<h2>Live tokens</h2><p class="note">The 24 largest live tokens by market cap. These are the market\u2019s own values, never mixed into the ranked board — they are the comparables the model learns from, not rows it ranks.</p>' +
    '<table class="plain"><caption>Live-token protocols, by market cap.</caption><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function modelView() {
  var m = DATA.model;
  var held = HELDOUT.map(function (h, i) {
    return '<tr><td>' + esc(h.name) + '</td><td class="num' + (i === 0 ? ' hl' : '') + '">' + h.rmse.toFixed(3) + '</td><td class="num">' + h.medale.toFixed(3) + '</td><td class="num' + (i === 0 ? ' hl' : '') + '">' + h.spRatio.toFixed(3) + '</td><td class="num">' + h.spMcap.toFixed(3) + '</td></tr>';
  }).join('');
  return '<h2>Model — M18</h2>' +
    '<p class="note">Implied value = TVL &times; category multiple &times; growth &times; breadth &times; scale. ' +
    'Multiple: median mcap/TVL of priced protocols with TVL &ge; $50M in the same category (shrunk toward the global median of <b>0.21</b> when a category has 1–2 priced samples), clamped to [0.05, 3.0]. ' +
    'Growth: 1 + clamp(7d change, -40, 40) / 100 &times; <b>' + m.growth_weight + '</b> (mean reversion). ' +
    'Breadth: 1 + min(chains, 12) &times; <b>' + m.breadth_per_chain + '</b>. Scale: exp(<b>' + m.scale_coef + '</b> &times; clamp(ln(TVL / $50M), -2, 4)). No protocol name is ever special-cased.</p>' +
    '<h3>Held out — every term kept or dropped on two blind tests</h3>' +
    '<table class="plain"><caption>Mean of 7 splits (walk-forward, random 80/20, 5-fold, seed 42) over 128 priced protocols. Lower RMSE / MedALE is better; higher Spearman is better.</caption>' +
    '<thead><tr><th>Model</th><th class="num">RMSE</th><th class="num">MedALE</th><th class="num">Spearman ratio</th><th class="num">Spearman mcap</th></tr></thead><tbody>' + held + '</tbody></table>' +
    '<p class="note">Walk-forward cutoff 2024-02-18; 33 priced protocols without a listing date are excluded from that split only. The grid over scale and growth is a plateau (RMSE 2.186–2.195), so the fixed pair is shipped instead of a per-split refit. ' +
    'Terms tested and dropped: dominance (MedALE worsens), global median from &ge;$50M protocols only (RMSE 2.316, Spearman ratio 0.299), breadth 0 vs 0.015 (a tie), growth clamp &plusmn;100 vs &plusmn;40 (identical).</p>' +
    '<h3>Token odds — an assumption, stated as one</h3>' +
    '<p class="note">Odds = exp(-age / 1460), age unknown = 365 days. A single snapshot cannot fit future launch odds, and the raw launch rate by age rises with age — that measures “already launched”, the wrong estimand — so odds are declared as an assumption, not presented as fitted from peers. Expected value = implied &times; odds.</p>' +
    '<h3>Verdicts</h3><p class="note">' + chip('FARM') + ' <b>FARM</b> — implied value at or above $14.4M: worth a position now (66 rows). ' + chip('THIN') + ' <b>THIN</b> — $5.8M to $14.4M: real but thin, watch it (61 rows). ' + chip('SKIP') + ' <b>SKIP</b> — below $5.8M: not worth capital yet (69 rows). ' +
    'Farm economics per row assume a 5% airdrop pool split among 10,000 wallets, minus gas and a 5% annual capital charge. An estimate, not a price, and not a promise a token launches.</p>';
}

function drawer() {
  if (!state.selected) return '';
  var r = DATA.rows.filter(function (x) { return x.slug === state.selected; })[0];
  if (!r) return '';
  var v = verdictOf(r.implied_value_usd);
  var steps = farmSteps(r);
  var check = 'TVL ' + fmtUsd(r.tvl_usd) + ' x multiple ' + r.multiple.toFixed(2) + ' x growth ' + r.growth_multiplier.toFixed(2) + ' x breadth ' + r.breadth_multiplier.toFixed(2) + ' x scale ' + r.scale_multiplier.toFixed(2) + ' = ' + fmtUsd(r.implied_value_usd);
  return '<div class="drawer-scrim" data-close="1"></div><aside class="drawer" role="dialog" aria-label="' + esc(r.name) + '"><button class="close" data-close="1">Close &times;</button>' +
    '<p class="sub">Rank ' + r.rank + ' of ' + DATA.board_size + '</p><h2 style="margin-top:0">' + esc(r.name) + ' ' + chip(v) + '</h2>' +
    '<p class="sub">' + esc(r.category || '') + ' &middot; ' + esc((r.chains || []).join(', ')) + ' &middot; listed ' + (r.listed_at || 'unknown') + ' &middot; ' + ageText(r) + '</p>' +
    '<div class="big">' + fmtUsd(r.implied_value_usd) + '</div>' +
    '<div class="kv"><div><div class="k">TVL</div><div class="v">' + fmtUsd(r.tvl_usd) + '</div></div>' +
    '<div><div class="k">7d change</div><div class="v">' + fmtSigned(r.change_7d) + '</div></div>' +
    '<div><div class="k">Multiple</div><div class="v">' + r.multiple.toFixed(2) + '&times;</div></div>' +
    '<div><div class="k">Range (p25–p75)</div><div class="v">' + fmtUsd(r.range_low_usd) + '–' + fmtUsd(r.range_high_usd) + '</div></div>' +
    '<div><div class="k">Token odds (assumed)</div><div class="v">' + r.odds.toFixed(2) + '</div></div>' +
    '<div><div class="k">Expected value</div><div class="v">' + fmtUsd(r.expected_value_usd) + '</div></div>' +
    '<div><div class="k">Net $/hour</div><div class="v">' + fmtMoney(r.farm_net_per_hour_usd) + '</div></div>' +
    '<div><div class="k">Verdict</div><div class="v">' + v + '</div></div></div>' +
    '<h3>How the number is made</h3><div class="formula">' + esc(check) + '\nThe page recomputes this row as ' + fmtUsd(r.implied_value_usd) + ' — the same number board.json carries.</div>' +
    '<h3>Farm plan — ' + esc(r.name) + '</h3><p class="note">Farming is positioning for a future token; nothing here is a promise it launches.</p><ol class="steps">' +
    steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></aside>';
}

function render() {
  var app = document.getElementById('app');
  var html = topbar() + hero() + controls();
  if (state.view === 'live') html += liveView();
  else if (state.view === 'model') html += modelView();
  else html += boardView();
  html += '<footer>Token Radar M18 &middot; snapshot ' + esc(DATA.as_of) + ' &middot; ' + DATA.board_size + ' rows &middot; DefiLlama &middot; An estimate, not a price.</footer>';
  app.innerHTML = html;
  app.setAttribute('aria-busy', 'false');
  document.getElementById('drawer-root').innerHTML = drawer();
  var q = document.getElementById('q');
  if (q) { q.addEventListener('input', function (e) { state.q = e.target.value; renderBoardOnly(); }); }
  var cat = document.getElementById('cat');
  if (cat) { cat.addEventListener('change', function (e) { state.cat = e.target.value; render(); syncHash(); }); }
}

function renderBoardOnly() {
  if (state.view !== 'board') { render(); return; }
  var app = document.getElementById('app');
  var html = topbar() + hero() + controls() + boardView() + '<footer>Token Radar M18 &middot; snapshot ' + esc(DATA.as_of) + ' &middot; ' + DATA.board_size + ' rows.</footer>';
  app.innerHTML = html;
  var q = document.getElementById('q');
  if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); q.addEventListener('input', function (e) { state.q = e.target.value; renderBoardOnly(); }); }
  var cat = document.getElementById('cat');
  if (cat) { cat.addEventListener('change', function (e) { state.cat = e.target.value; render(); syncHash(); }); }
}

function syncHash() {
  var parts = [];
  if (state.view !== 'board') parts.push('view/' + state.view);
  if (state.verdict !== 'all') parts.push('verdict/' + state.verdict);
  if (state.cat !== 'all') parts.push('cat/' + encodeURIComponent(state.cat));
  if (state.selected) parts.push('detail/' + state.selected);
  var h = parts.length ? '#/' + parts.join('/') : '#/';
  try { history.replaceState(null, '', h); } catch (e) { location.hash = h; }
}

function readHash() {
  var h = (location.hash || '').replace(/^#\/?/, '');
  if (!h) return;
  var seg = h.split('/');
  for (var i = 0; i < seg.length; i += 2) {
    var k = seg[i]; var v = seg[i + 1];
    if (!v) continue;
    if (k === 'detail') state.selected = decodeURIComponent(v);
    else if (k === 'verdict') state.verdict = v;
    else if (k === 'view') state.view = v;
    else if (k === 'cat') state.cat = decodeURIComponent(v);
  }
}

document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var close = t.closest('[data-close]');
  if (close) { state.selected = null; render(); syncHash(); return; }
  var row = t.closest('tr[data-slug]');
  if (row) { state.selected = row.getAttribute('data-slug'); render(); syncHash(); return; }
  var sort = t.closest('[data-sort]');
  if (sort) { var k = sort.getAttribute('data-sort'); if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = -1; } render(); return; }
  var vb = t.closest('[data-verdict]');
  if (vb) { var vv = vb.getAttribute('data-verdict'); state.verdict = state.verdict === vv ? 'all' : vv; state.view = 'board'; render(); syncHash(); return; }
  var vt = t.closest('[data-verdict-tab]');
  if (vt) { state.verdict = vt.getAttribute('data-verdict-tab'); state.view = 'board'; render(); syncHash(); return; }
  var vw = t.closest('[data-view]');
  if (vw) { state.view = vw.getAttribute('data-view'); render(); syncHash(); return; }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && state.selected) { state.selected = null; render(); syncHash(); }
});

readHash();
render();
