# Token Radar v3

[![bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01)

A radar for pre-token protocols: every protocol in the snapshot that records
no token yet, ranked by implied value. The 40-protocol watchlist is covered
in full, plus the strongest pre-token protocols the watchlist does not
already hold — whatever their TVL, including above-floor protocols the house
rule missed — for a 196-row board. Protocols whose token already trades are shown apart, at the
market's own value.

## The model

Implied value = TVL × category multiple × growth × maturity × breadth × scale.

- **Category multiple** — derived from the snapshot itself: the median
  market-cap / TVL of that category's live-token protocols (at least 3 live
  samples, otherwise the global live median), clamped to [0.05, 3].
- **Growth** — 7-day change clamped to ±40%, weight 0.6.
- **Maturity** — 0.7 + min(age, 1460d) / 1460 × 0.3; older with no token is
  slightly more valuable. Unknown age counts as 0.7.
- **Breadth** — 1 + min(chains, 12) × 0.015.
- **Scale** — 0.95 below $50M TVL, 1.00 from $50M, 1.05 at $250M+.

No protocol name is ever special-cased. Every row carries a 5-step farm
plan with a dollar cost and a time for each step, derived from the
protocol's category, chains, TVL and age.

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
sortable, filterable board, a detail view per protocol with the full
valuation maths and its farm plan, the live-token view, and the model with
its per-category comparables table. No network anywhere.

Bounty: https://make.fun/bounty/token-radar-01
