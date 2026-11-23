# Token Radar — method

Snapshot: DefiLlama, as of 2026-11-14. Model version: radar-v3.

## The formula

`implied = TVL × category multiple × growth × maturity × breadth × scale`

| Factor | Rule |
| --- | --- |
| Category multiple | Median mcap / TVL of the category's live-token protocols with TVL ≥ $50,000,000; see Comparables below. |
| Growth | 7-day change clamped to ±40%, weight 0.6: 1 + growth / 100 × 0.6. A one-week wiggle cannot double a value. |
| Maturity | 0.7 + min(age, 1460d) / 1460 × 0.3. Older with no token = more proved, slightly more valuable. Unknown age counts as 0.7. |
| Breadth | 1 + min(chains, 12) × 0.015. |
| Scale | 0.95 below $50M TVL, 1.00 from $50M, 1.05 at $250M+. |
| Result | Rounded to the dollar, at least $1. |

No protocol name is ever special-cased: the same function scores every row, from the snapshot figures only.

## Comparables — how each category gets its multiple

A comparables sample is a live-token protocol (it records a token) with TVL at or above $50,000,000. With at least 3 samples a category trusts its own median. With 1 or 2, the multiple is shrunk toward the global live median (0.1689×), weighted 3: (n × raw + 3 × global) / (n + 3). With none, the category takes the global median outright. Every multiple is clamped to [0.05, 3].

8 categories use their own median, 16 use the shrunk blend, and 29 fall back to the global median — 29 of those have no eligible live comparables at all.

| Category | Multiple | Raw median | Samples | Source |
| --- | --- | --- | --- | --- |
| CEX | 0.0500× | 0.0336× | 9 | category |
| Canonical Bridge | 0.3520× | 0.3520× | 5 | category |
| Liquid Staking | 0.0500× | 0.0134× | 5 | category |
| Lending | 0.5862× | 0.5862× | 4 | category |
| RWA | 0.1784× | 0.1784× | 4 | category |
| Basis Trading | 0.2042× | 0.2042× | 3 | category |
| Privacy | 0.9691× | 0.9691× | 3 | category |
| Yield | 0.1691× | 0.1691× | 3 | category |
| Bridge | 0.1367× | 0.0884× | 2 | shrunk |
| Onchain Capital Allocator | 0.1063× | 0.0125× | 2 | shrunk |
| Restaking | 0.1112× | 0.0246× | 2 | shrunk |
| Staking Pool | 0.1020× | 0.0018× | 2 | shrunk |
| CDP | 0.1287× | 0.0080× | 1 | shrunk |
| Cross Chain Bridge | 0.1857× | 0.2360× | 1 | shrunk |
| DOR | 0.1491× | 0.0898× | 1 | shrunk |
| Dexs | 0.9223× | 3.1823× | 1 | shrunk |
| Dual-Token Stablecoin | 0.1346× | 0.0316× | 1 | shrunk |
| Farm | 0.1267× | 0.0000× | 1 | shrunk |
| Indexes | 0.1395× | 0.0514× | 1 | shrunk |
| Launchpad | 0.1593× | 0.1306× | 1 | shrunk |
| Leveraged Farming | 0.1698× | 0.1725× | 1 | shrunk |
| Liquid Restaking | 0.2129× | 0.3451× | 1 | shrunk |
| Token Locker | 0.1430× | 0.0652× | 1 | shrunk |
| Yield Aggregator | 0.1393× | 0.0504× | 1 | shrunk |
| AI Agents | 0.1689× | n/a | 0 | global |
| Algo-Stables | 0.1689× | n/a | 0 | global |
| Anchor BTC | 0.1689× | n/a | 0 | global |
| CDP Manager | 0.1689× | n/a | 0 | global |
| CeDeFi | 0.1689× | n/a | 0 | global |
| Chain | 0.1689× | n/a | 0 | global |
| Collateral Management | 0.1689× | n/a | 0 | global |
| Collateral Markets | 0.1689× | n/a | 0 | global |
| Crypto Card Issuer | 0.1689× | n/a | 0 | global |
| Decentralized AI | 0.1689× | n/a | 0 | global |
| Decentralized BTC | 0.1689× | n/a | 0 | global |
| Derivatives | 0.1689× | n/a | 0 | global |
| Governance Incentives | 0.1689× | n/a | 0 | global |
| Insurance | 0.1689× | n/a | 0 | global |
| Interest Rate Derivatives | 0.1689× | n/a | 0 | global |
| Liquidity Manager | 0.1689× | n/a | 0 | global |
| NFT Marketplace | 0.1689× | n/a | 0 | global |
| OTC Marketplace | 0.1689× | n/a | 0 | global |
| Options | 0.1689× | n/a | 0 | global |
| Options Vault | 0.1689× | n/a | 0 | global |
| Payments | 0.1689× | n/a | 0 | global |
| Prediction Market | 0.1689× | n/a | 0 | global |
| Reserve Currency | 0.1689× | n/a | 0 | global |
| Restaked BTC | 0.1689× | n/a | 0 | global |
| Risk Curators | 0.1689× | n/a | 0 | global |
| Stablecoin Issuer | 0.1689× | n/a | 0 | global |
| Stablecoin Wrapper | 0.1689× | n/a | 0 | global |
| Synthetics | 0.1689× | n/a | 0 | global |
| Uncollateralized Lending | 0.1689× | n/a | 0 | global |

## Why the thin categories fall back

- **Risk Curators has no own multiple.** Its only live entry in the snapshot is Api3 — an oracle network, filed under Risk Curators — at $11,776,271 TVL, below the $50,000,000 comparables floor, with a ratio of 2.9747×. One small oracle cannot price the curator category, so Risk Curators takes the global median.
- **Rain's 400× ratio is a data artefact, not a comparable.** Rain records a $2,646,363,290 market cap on $6,612,528 TVL, a ratio of 400.2045×. Below the $50,000,000 floor it never enters the comparables, so Prediction Market takes the global median.
- **Anvil is the same story at a smaller scale.** Its ratio of 12.1602× comes from $13,125,243 TVL, below the floor, so Collateral Management also takes the global median.
- **Onchain Capital Allocator's low multiple is genuine, not an error.** Its eligible live protocols price low — Concrete 0.0191×, Grove Finance 0.0059× — for a raw median of 0.0125× from 2 samples, blended with the global median to 0.1063×. The category really does trade far below its TVL.

## Top 10

| Rank | Protocol | Implied value | TVL | Multiple (source) | 7d | Age | Chains |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Steakhouse Financial | $455,702,111 | $2,753,981,495 | 0.1689× (global) | -2.19% | 1.5y | 11 |
| 2 | Sentora Curator | $411,993,080 | $2,757,585,593 | 0.1689× (global) | +2.37% | 1.1y | 4 |
| 3 | Gauntlet | $277,023,210 | $1,577,685,462 | 0.1689× (global) | +5.64% | 1.5y | 14 |
| 4 | Bittensor dTAO | $252,631,581 | $376,026,255 | 0.9223× (shrunk) | -6.56% | 56d | 1 |
| 5 | Veda | $162,378,448 | $1,563,415,482 | 0.1063× (shrunk) | -8.29% | 1.7y | 13 |
| 6 | USDD | $121,012,687 | $1,055,793,606 | 0.1287× (shrunk) | -2.81% | 1.7y | 3 |
| 7 | Figure Markets Prime | $100,165,178 | $190,506,995 | 0.5862× (category) | +18.03% | 1.3y | 1 |
| 8 | Curvance | $62,909,365 | $136,345,059 | 0.5862× (category) | +0.68% | 352d | 1 |
| 9 | Nonce Capital | $62,674,097 | $513,783,671 | 0.1689× (global) | -9.74% | 45d | 2 |
| 10 | Upshift | $58,375,108 | $499,083,733 | 0.1063× (shrunk) | +8.31% | 1.9y | 15 |

## Sample farm plan — #1 Steakhouse Financial (verbatim)

1. Set up a fresh wallet on Base for Steakhouse Financial only, funded with the $250 you plan to farm plus about $10 for gas, and keep its seed phrase offline on paper. Read the vault's latest strategy note on the protocol's own page before depositing. Cost: under $3 of gas for the first transaction. Time: 5 minutes.
2. Deposit $250 of USDC into a Steakhouse Financial vault on Base and keep the vault shares in the same wallet. Cost: $250 of capital and about $8 of gas. Time: 15 minutes to set up.
3. Each week, read Steakhouse Financial's vault update notes and check the strategy or fee has not changed. Cost: about $2 of gas a week. Time: 10 minutes a week.
4. Hold the position for at least 30 days so the activity is counted in more than one snapshot. Watch for vault strategy changes: read the vault update notes weekly, and exit if the strategy or fee changes. Cost: the $250 stays in the position. Time: 30 days.
5. Redeem the vault shares on Steakhouse Financial, claim any rewards from the protocol's own page, and log the wallet, dates and every transaction. Cost: no fee to check, about $2 to $5 of gas to claim. Time: 10 minutes.

## Coverage

- Watchlist: 40 of 40 covered. Board: 196 rows (156 early rows beyond the watchlist). Live tokens shown apart, at the market's own value: 24.
- Early-row exclusions: exchanges (CEX), bridges of any kind, liquid-staking and liquid-restaking products, restaked-BTC products, versioned pools, and wrapped or staked names. Watchlist rows are never excluded.
- Nothing in this document is claimed about a protocol that its snapshot record does not support: no vault names, no APYs, no points programs.
