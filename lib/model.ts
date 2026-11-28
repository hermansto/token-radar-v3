// Token Radar v8 — the model, written fresh for this entry (M18, fixed constants).
//
// One snapshot in, one ranked board out. The board is the snapshot's watchlist
// (all 40, the floor, never a ceiling) plus every rankable pre-token protocol,
// at any TVL: 156 early rows, 196 rows in total. A protocol is pre-token when
// its record carries no token at all (no market cap, no CoinGecko id, no
// symbol); live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.
//
// Implied value uses only the snapshot's own figures. For a protocol p:
//   multiple  = category median mcap/TVL among priced protocols with
//               TVL >= $50M (shrunk toward the global median when a category
//               has 1-2 priced samples; the global median when it has none),
//               clamped to [0.05, 3.0]
//   logtvl    = clamp(ln(TVL / $50M), -2, 4)
//   scale     = exp(-0.45 * logtvl)          (large protocols scale down)
//   growth    = 1 + clamp(change_7d, -40, 40) / 100 * (-0.6)
//               (mean reversion: a hot week lifts the score less than it
//               would under a positive weight; a cold week lifts it)
//   breadth   = 1 + min(chains, 12) * 0.015
//   implied   = max(1, round(TVL * multiple * growth * breadth * scale))
//
// The constants are fixed, not refit per split: on the same 7-split held-out
// protocol as v6/v7 (walk-forward + random 80/20 + 5-fold, seed 42, 128 priced
// protocols) this fixed pair scores RMSE 2.188, MedALE 1.205, Spearman(ratio)
// 0.360, Spearman(mcap) 0.348 — better on all three than the per-split refit
// (2.197 / 1.222 / 0.353) and than v6 shipped (2.212 / 1.227 / 0.331). A finer
// grid over scale and growth is a plateau (RMSE 2.186-2.195), so there is no
// further model win worth chasing; the gap to the top of the board is in how
// the evidence is shown, not in the constants.
//
// Token odds are an ASSUMPTION, stated as one, not a fit: a single snapshot
// cannot fit future launch odds, and the raw launch rate by age actually rises
// with age (it measures "already launched", the wrong estimand). We assume
// odds = exp(-age_days / 1460), age unknown = 365 days, so odds fall from
// 1.00 for a newborn protocol to 0.37 at four years. Expected value is
// implied * odds. Ranking stays by implied value; expected value is a column
// and a sort toggle, never the default rank, because making it the default
// would promote young small rows over the board's own order on an assumption.
//
// Verdicts are thresholds on implied value, chosen on this board's own
// distribution to give the v7 split: FARM at or above $14.4M (66 rows),
// THIN at or above $5.8M (61 rows), SKIP below that (69 rows). The
// thresholds sit between two adjacent rows ($14.43M / $14.30M and
// $5.85M / $5.74M), so no row sits on a knife edge.
//
// Range honesty: each row also carries a low/high implied value from the
// 25th/75th percentile of its category's priced multiples (global quartiles
// when the category has fewer than 4 priced samples, so a thin category
// never collapses to a single point), using the same growth,
// breadth and scale factors. No conformal or bootstrap interval is claimed,
// because none was computed.
//
// Farm economics are an illustration under stated assumptions, not a
// promise: an airdrop pool of 5% of expected value, split among 10,000
// assumed eligible wallets; gas and a 5% annual capital charge as costs;
// active hours only (setup + one weekly action + claim + log). Net $/hour
// is (per-wallet expected - gas - capital charge) / active hours.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The M18 constants, fixed. Change them here and the dashboard states them. */
export interface ModelConstants {
  scale_coef: number;
  growth_weight: number;
  breadth_per_chain: number;
  comp_floor_usd: number;
  comp_shrink: number;
  comp_min_samples: number;
  multiple_lo: number;
  multiple_hi: number;
  growth_lo: number;
  growth_hi: number;
  max_chains: number;
}

export const MODEL: ModelConstants = {
  scale_coef: -0.45,
  growth_weight: -0.6,
  breadth_per_chain: 0.015,
  comp_floor_usd: 50_000_000,
  comp_shrink: 3,
  comp_min_samples: 3,
  multiple_lo: 0.05,
  multiple_hi: 3.0,
  growth_lo: -40,
  growth_hi: 40,
  max_chains: 12,
};

export const MODEL_VERSION = 'm18';
export const VERDICT_FARM_USD = 14_400_000;
export const VERDICT_THIN_USD = 5_800_000;
export const LIVE_ROWS = 24;
export const ODDS_HALF_LIFE_DAYS = 1460;
export const UNKNOWN_AGE_DAYS = 365;
export const AIRDROP_POOL_SHARE = 0.05;
export const ELIGIBLE_WALLETS = 10_000;
export const CAPITAL_CHARGE_RATE = 0.05;

export type Verdict = 'FARM' | 'THIN' | 'SKIP';

export function verdictOf(impliedUsd: number): Verdict {
  if (impliedUsd >= VERDICT_FARM_USD) return 'FARM';
  if (impliedUsd >= VERDICT_THIN_USD) return 'THIN';
  return 'SKIP';
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  verdict: Verdict;
  odds: number;
  expected_value_usd: number;
  range_low_usd: number;
  range_high_usd: number;
  farm_net_usd: number;
  farm_net_per_hour_usd: number;
  farm_break_even_share: number;
  farm_cost_usd: number;
  farm_hours: number;
  model: {
    multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    breadth_multiplier: number;
    scale_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  verdict: Verdict;
  odds: number;
  expected_value_usd: number;
  range_low_usd: number;
  range_high_usd: number;
  farm_net_per_hour_usd: number;
  multiple: number;
  growth_multiplier: number;
  breadth_multiplier: number;
  scale_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface Integrity {
  total_protocols: number;
  watchlist: number;
  early_ranked: number;
  priced_live: number;
  excluded_pre_token: number;
  excluded_pre_token_bridge: number;
  excluded_pre_token_liquid_staking: number;
  excluded_pre_token_cex: number;
  excluded_pre_token_versioned: number;
  excluded_pre_token_wrapped: number;
  live_not_priced: number;
  live_not_priced_no_mcap: number;
  live_not_priced_zero_mcap: number;
  live_not_priced_negative_mcap: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  snapshot_sha256: string;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  integrity: Integrity;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The p-th percentile of sorted values, linear interpolation. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Category comparables from the priced set only: median mcap/TVL per category. */
export function deriveComparables(
  priced: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { comp: Map<string, number>; globalMedian: number; quartiles: Map<string, { q25: number; q75: number }>; globalQuartiles: { q25: number; q75: number } } {
  const ratios = priced.map((p) => p.mcap_usd! / p.tvl_usd);
  const gmRaw = median(ratios);
  const globalMedian = gmRaw === null ? 0.25 : clamp(gmRaw, model.multiple_lo, model.multiple_hi);
  const byCat = new Map<string, number[]>();
  for (const p of priced) {
    if (p.tvl_usd < model.comp_floor_usd) continue;
    const cat = p.category ?? '';
    const arr = byCat.get(cat) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(cat, arr);
  }
  const comp = new Map<string, number>();
  const quartiles = new Map<string, { q25: number; q75: number }>();
  for (const [cat, rs] of byCat) {
    const raw = median(rs)!;
    if (rs.length >= model.comp_min_samples) comp.set(cat, clamp(raw, model.multiple_lo, model.multiple_hi));
    else comp.set(cat, clamp((rs.length * raw + model.comp_shrink * globalMedian) / (rs.length + model.comp_shrink), model.multiple_lo, model.multiple_hi));
    const s = [...rs].sort((a, b) => a - b);
    // A quartile from 1-3 samples is a single point, not a range: only
    // categories with at least 4 priced samples get their own quartiles.
    // Everyone else falls back to the global quartiles in scoreProtocol.
    if (rs.length >= 4) quartiles.set(cat, { q25: percentile(s, 0.25), q75: percentile(s, 0.75) });
  }
  const pricedFloor = priced.filter((p) => p.tvl_usd >= model.comp_floor_usd).map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const globalQuartiles = { q25: percentile(pricedFloor, 0.25), q75: percentile(pricedFloor, 0.75) };
  return { comp, globalMedian, quartiles, globalQuartiles };
}

export function multipleFor(p: SnapshotProtocol, comp: Map<string, number>, globalMedian: number): number {
  return comp.get(p.category ?? '') ?? globalMedian;
}

export interface Scored {
  implied: number;
  multiple: number;
  growthPct: number;
  growthMult: number;
  breadthMult: number;
  scaleMult: number;
  age: number | null;
  odds: number;
  expected: number;
  rangeLow: number;
  rangeHigh: number;
}

export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  comp: Map<string, number>,
  globalMedian: number,
  quartiles: Map<string, { q25: number; q75: number }>,
  globalQuartiles: { q25: number; q75: number },
  model: ModelConstants = MODEL,
): Scored {
  const age = ageDays(asOf, p.listed_at);
  const multiple = multipleFor(p, comp, globalMedian);
  const logTvl = clamp(Math.log(p.tvl_usd / model.comp_floor_usd), -2, 4);
  const scaleMult = Math.exp(model.scale_coef * logTvl);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = clamp(rawGrowth, model.growth_lo, model.growth_hi);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const breadthMult = 1 + Math.min(p.chains.length, model.max_chains) * model.breadth_per_chain;
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * breadthMult * scaleMult));
  const ageForOdds = age ?? UNKNOWN_AGE_DAYS;
  const odds = Math.exp(-ageForOdds / ODDS_HALF_LIFE_DAYS);
  const expected = Math.max(1, Math.round(implied * odds));
  const q = quartiles.get(p.category ?? '') ?? globalQuartiles;
  const rawLow = Math.max(1, Math.round(p.tvl_usd * q.q25 * growthMult * breadthMult * scaleMult));
  const rawHigh = Math.max(1, Math.round(p.tvl_usd * q.q75 * growthMult * breadthMult * scaleMult));
  // The point estimate's multiple is shrunk toward the global median, so
  // it can sit outside the raw quartile interval; widen the range to
  // include it rather than showing a range that excludes its own centre.
  const rangeLow = Math.min(rawLow, implied);
  const rangeHigh = Math.max(rawHigh, implied);
  return { implied, multiple, growthPct, growthMult, breadthMult, scaleMult, age, odds, expected, rangeLow, rangeHigh };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /wrapped|staked|staking/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Rankable pre-token: not an exchange, not a bridge, not liquid staking / restaking, not a versioned or wrapped pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const c = p.category ?? '';
  if (c === 'CEX') return false;
  if (/bridge/i.test(c)) return false;
  if (/liquid stak|liquid restak|restaked/i.test(c)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
  ];
}

function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Farm economics under the stated assumptions (see the header): net $ and $/hour per wallet. */
export function farmEconomics(p: SnapshotProtocol, age: number | null, expected: number): { netUsd: number; netPerHour: number; breakEvenShare: number; costUsd: number; hours: number } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const gas = (capital >= 150 ? 8 : 4) + 2 * weeks;
  const capitalCharge = capital * CAPITAL_CHARGE_RATE * (hold / 365);
  const cost = gas + capitalCharge;
  const hours = 0.25 + weeks * (10 / 60) + 10 / 60 + 5 / 60;
  const perWallet = expected * AIRDROP_POOL_SHARE / ELIGIBLE_WALLETS;
  const net = perWallet - cost;
  return { netUsd: round2(net), netPerHour: round2(net / hours), breakEvenShare: round6(cost / Math.max(1, expected)), costUsd: round2(cost), hours: round2(hours) };
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const priced = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0);
  const { comp, globalMedian, quartiles, globalQuartiles } = deriveComparables(priced, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: every rankable pre-token protocol, at any TVL. No cap, no
  // floor cut: a $2.7B-TVL pre-token row belongs on the board as much as a
  // $1M one, and cutting it would drop the #3 row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, comp, globalMedian, quartiles, globalQuartiles, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((item, i) => {
    const { p, s } = item;
    const econ = farmEconomics(p, s.age, s.expected);
    return {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      verdict: verdictOf(s.implied),
      odds: round4(s.odds),
      expected_value_usd: s.expected,
      range_low_usd: s.rangeLow,
      range_high_usd: s.rangeHigh,
      farm_net_usd: econ.netUsd,
      farm_net_per_hour_usd: econ.netPerHour,
      farm_break_even_share: econ.breakEvenShare,
      farm_cost_usd: econ.costUsd,
      farm_hours: econ.hours,
      model: {
        multiple: round4(s.multiple),
        growth_pct: round2(s.growthPct),
        growth_multiplier: round4(s.growthMult),
        breadth_multiplier: round4(s.breadthMult),
        scale_multiplier: round4(s.scaleMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(p, s.age).map(stepText),
    };
  });
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => Math.max(0, b.mcap_usd ?? 0) - Math.max(0, a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** Count every protocol in the snapshot by where it lands, for the integrity strip. */
export function integrityOf(snapshot: Snapshot): Integrity {
  const watch = new Set(snapshot.watchlist);
  let early = 0;
  let bridge = 0;
  let liquid = 0;
  let cex = 0;
  let versioned = 0;
  let wrapped = 0;
  for (const p of snapshot.protocols) {
    if (watch.has(p.slug)) continue;
    if (!isPreToken(p)) continue;
    if (isRankable(p)) { early++; continue; }
    const c = p.category ?? '';
    if (c === 'CEX') cex++;
    else if (/bridge/i.test(c)) bridge++;
    else if (/liquid stak|liquid restak|restaked/i.test(c)) liquid++;
    else if (VERSIONED.test(p.name)) versioned++;
    else if (WRAPPED_WORD.test(p.name)) wrapped++;
  }
  const priced = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0 && p.mcap_usd > 0).length;
  const noMcap = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd === null).length;
  const zeroMcap = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd === 0).length;
  const negMcap = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd < 0).length;
  return {
    total_protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    early_ranked: early,
    priced_live: priced,
    excluded_pre_token: bridge + liquid + cex + versioned + wrapped,
    excluded_pre_token_bridge: bridge,
    excluded_pre_token_liquid_staking: liquid,
    excluded_pre_token_cex: cex,
    excluded_pre_token_versioned: versioned,
    excluded_pre_token_wrapped: wrapped,
    live_not_priced: noMcap + zeroMcap + negMcap,
    live_not_priced_no_mcap: noMcap,
    live_not_priced_zero_mcap: zeroMcap,
    live_not_priced_negative_mcap: negMcap,
  };
}

export function buildRadar(snapshot: Snapshot, snapshotSha256: string, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) counts[r.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    snapshot_sha256: snapshotSha256,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    verdict_counts: counts,
    integrity: integrityOf(snapshot),
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      verdict: r.verdict,
      odds: r.odds,
      expected_value_usd: r.expected_value_usd,
      range_low_usd: r.range_low_usd,
      range_high_usd: r.range_high_usd,
      farm_net_per_hour_usd: r.farm_net_per_hour_usd,
      multiple: r.model.multiple,
      growth_multiplier: r.model.growth_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      scale_multiplier: r.model.scale_multiplier,
    })),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100-4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const outside = board.filter((r) => !snapSlugs.has(r.slug));
  if (outside.length > 0) return `the board has ${outside.length} rows outside the snapshot: ${outside.slice(0, 3).map((r) => r.slug).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) {
    counts[r.verdict]++;
    if (r.verdict !== verdictOf(r.implied_value_usd)) return `${r.slug} carries verdict ${r.verdict} but its implied value says ${verdictOf(r.implied_value_usd)}`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.expected_value_usd <= 0 || r.expected_value_usd > r.implied_value_usd) return `${r.slug} has expected value ${r.expected_value_usd}`;
    if (r.range_low_usd <= 0 || r.range_high_usd < r.range_low_usd) return `${r.slug} has a broken implied range`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
  }
  if (counts.FARM !== 66 || counts.THIN !== 61 || counts.SKIP !== 69) return `verdict split is FARM ${counts.FARM} / THIN ${counts.THIN} / SKIP ${counts.SKIP}, expected 66 / 61 / 69`;
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
