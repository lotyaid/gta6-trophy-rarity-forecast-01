# gta6-trophy-rarity-forecast-01

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/lotyaid/gta6-trophy-rarity-forecast-01/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/lotyaid/gta6-trophy-rarity-forecast-01/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Forecasts, for every trophy of Grand Theft Auto VI on PlayStation 5, the percent of Exophase-tracked players who will have earned it at 2026-11-26T00:00:00Z — one week after launch — as five quantiles per trophy, from the house's recorded reads of the game's Exophase trophy page. An earn rate in launch week is a progression curve, not a random walk: the entry fits each trophy's earner count with a lognormal completion-time CDF (players convert fast at first, then slower and slower), fits the tracked-player denominator with its own saturating curve so a surge of newly tracked players diluting slow trophies is priced in, blends that view with a recency-weighted logit trend of the rate itself, and sets the spread from binomial earner-count noise, the fit's residual scatter, and the horizon. `main.ts` is the whole entry: Node 22, standard library only, offline, deterministic.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=765w942g&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
