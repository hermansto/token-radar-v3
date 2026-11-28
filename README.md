# Token Radar M18

hermansto/token-radar-v3

[![bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hermansto/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01)

The next token, ranked before it exists. Token Radar M18 prices 196 pre-token protocols off the 128 tokens that already trade, on the 2026-11-14 snapshot: 40 watchlist protocols plus 156 early finds at any TVL, including rows above the $50M floor.

Model: category median mcap/TVL among priced protocols with TVL at or above $50M, fixed scale -0.45 and growth -0.6 (mean reversion), breadth 0.015 per chain. Held out on seven splits, it scores RMSE 2.188, MedALE 1.205 and Spearman ratio 0.360, better than v6 shipped and better than a per-split refit. Token odds are an assumption, stated as one: odds fall with age, exp(-age/1460). Verdicts: FARM 66, THIN 61, SKIP 69, by implied value at $14.4M and $5.8M.

Run it with Node 22: `MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>`. It writes board.json, data.js, dashboard, screenshots and dossier.json. An estimate, not a price, and not a promise a token launches.
