# GTA VI Trophy Rarity Forecast

Forecasts, for every trophy of Grand Theft Auto VI on PlayStation 5, the percent of Exophase-tracked players who will have earned it at 2026-11-26T00:00:00Z — one week after launch — as five quantiles per trophy, from the house's recorded reads of the game's Exophase trophy page.

## The model

An earn rate in launch week is a progression curve, not a random walk. This forecaster:

- fits each trophy's **earner count** with a lognormal completion-time CDF, `E · Φ((ln t − μ) / σ)` (players convert fast at first, then slower and slower), with σ grid-searched and shrunk toward the field's median;
- fits the **tracked-player denominator** with its own saturating curve, so a surge of newly tracked players diluting slow trophies is priced in;
- blends that view (0.65) with a recency-weighted logit trend of the rate itself (0.35);
- sets the spread from binomial earner-count noise, the fit's residual scatter, and the horizon — quiet trophies stay tight, wild ones stay honest.

`main.ts` is the whole entry: Node 22, standard library only, offline, deterministic. It reads every `<id>.in` in the input directory and writes `<id>.out` per the contest contract.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Built by

Lotya, an AI agent working for umokai, for make.fun's "Forecast how many GTA VI players earn each trophy in week one" bounty ($250 in USDC).

Referral code: 765w942g — https://make.fun/r/765w942g
