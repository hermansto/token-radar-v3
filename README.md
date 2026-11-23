# Token Radar v5

[![bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01)

A radar for pre-token protocols: every protocol in the snapshot that records
no token yet, ranked by expected value — the implied value times the chance
it ever launches a token. The 40-protocol watchlist is covered in full, plus
the strongest pre-token protocols the watchlist does not already hold —
whatever their TVL, including above-floor protocols the house rule missed —
for a 196-row board. Protocols whose token already trades are shown apart, at the
market's own value.

## The model

Expected value = implied value × launch odds.
Implied value = TVL × category multiple × growth × breadth × scale.

- **Category multiple** — derived from the snapshot itself: the median
  market-cap / TVL of that category's live-token protocols with TVL at or
  above $50M and a positive market cap. At least 3 such samples, otherwise
  the multiple is shrunk toward the global live median, weighted 3; with
  none, it takes the global median outright. Clamped to [0.05, 3]. The full
  derivation — every category's multiple, raw median, samples and source,
  plus the fallback justifications — is in `dashboard/METHOD.md`, generated
  from the board by `main.ts` on every run.
- **Growth** — 7-day change clamped to ±40%, weight 0.6.
- **Breadth** — 1 + min(chains, 12) × 0.015.
- **Scale** — fitted, not a step: exp(−0.36 × clamp(log(TVL / $50M), −2, 4)).
  The multiple falls as TVL rises, so value grows like TVL^0.64. The
  coefficient is −0.36 on the full sample and negative in all seven
  held-out fits.
- **Maturity: flat.** Age carries no weight in the multiple — the fitted
  age coefficient is negative in 6 of 7 held-out fits. Age acts through
  the launch odds instead.
- **Launch odds** — the conditional chance a protocol ever launches a
  token, from the age-bucket survival curve in the snapshot itself. The
  fraction of protocols that record a token rises with age and plateaus
  near 29%; a protocol that has not launched by age N has used up most of
  its window. Odds are floored at 5%.

The terms were fitted and tested held-out on seven splits (one
walk-forward by listing date, one random 80/20, five cross-validation
folds): the v5 model beats the v4 hand-picked model on both error
(RMSE log 2.39 → 2.23) and ranking (Spearman 0.07 → 0.34). The full
fitted OLS is not shipped — it is unstable and loses to the minimal
change on every split. See `dashboard/METHOD.md` for the full fit report.

No protocol name is ever special-cased. Every row carries a 5-step farm
plan with a dollar cost and a time for each step, derived from the
protocol's category, chains, TVL and age, plus a costed verdict
(FARM / THIN / SKIP) from the launch odds and the expected value per
dollar committed.

## How to run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. It writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory
(and never deletes that directory). Running it twice writes identical bytes.

## The dashboard

Open `dashboard/index.html` next to `data.js` in the output directory: a
sortable, filterable board with the launch odds and the farm verdict, a
detail view per protocol with the full valuation maths and its farm plan,
the live-token view, and the model with its fit, its launch odds and its
per-category comparables table. No network anywhere.

Bounty: https://make.fun/bounty/token-radar-01
