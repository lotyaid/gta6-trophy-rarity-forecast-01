// gta6-trophy-rarity-forecast-01 entry (Node 22, standard library only).
//
// The model, in one paragraph: a trophy's earn rate a week into a launch is
// a progression curve, not a random walk around today's rate (the house
// persistence baseline). Earners accumulate like a completion-time
// distribution - many players finish a step fast, fewer and fewer convert
// later - so each trophy's earner count is fitted with a lognormal CDF in
// time since launch, E * Phi((ln t - mu) / sigma), over a grid of sigma
// with the asymptote E fitted by least squares and sigma shrunk toward the
// field's median. The tracked-player denominator gets its own saturating
// fit, so a surge of new tracked players diluting a slow trophy is priced
// in; the rate forecast is the two divided. That view is blended (0.65)
// with a recency-weighted logit trend of the rate itself (0.35) as a hedge.
// The spread combines binomial noise from the earner count, the fit's
// residual scatter and a horizon term, so quiet trophies stay tight and
// wild ones stay honest.
//
// Reads every <id>.in in the input directory, writes <id>.out beside the
// contract: {"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]}.
// Outside the grader's container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR
// stand in for /input and /output:
//   mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
/** Concavity of the trend clock, in days. */
const TAU = 1.25;
/** Spread floor and horizon growth, in logit units. */
const SIGMA_BASE = 0.2;
const SIGMA_PER_SQRT_DAY = 0.17;
const SIGMA_CAP = 1.7;
/** Sigma grid for the completion-time (lognormal CDF) earner fits. */
const CDF_SIGMAS = [0.5, 0.8, 1.1, 1.5, 2.0, 2.8];
/** Time-constant grid, in days, for the denominator's saturating fit. */
const N_TAUS = [0.5, 1, 2, 4, 8, 16];

interface TrophyMeta { id: number; tier: string }
interface Read { at: string; players_tracked: number; rates: Array<number | null> }
interface Case {
  levels: number[];
  horizon_minutes: number;
  trophies: TrophyMeta[];
  history: Read[];
}

const clampPct = (x: number): number => Math.min(99.99, Math.max(0.01, x));
const logit = (pct: number): number => Math.log(clampPct(pct) / (100 - clampPct(pct)));
const invLogit = (l: number): number => 100 / (1 + Math.exp(-l));
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
const clock = (days: number): number => Math.log(1 + days / TAU);

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf). */
function phi(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + s * erf);
}

/** Weighted least squares of y on g. Returns [alpha, beta, residSd]. */
function fitLine(series: Array<{ g: number; y: number; w: number }>): [number, number, number] {
  let sw = 0, sg = 0, sy = 0;
  for (const p of series) { sw += p.w; sg += p.w * p.g; sy += p.w * p.y; }
  const mg = sg / sw, my = sy / sw;
  let sgg = 0, sgy = 0;
  for (const p of series) { sgg += p.w * (p.g - mg) ** 2; sgy += p.w * (p.g - mg) * (p.y - my); }
  const beta = sgg > 1e-9 ? sgy / sgg : 0;
  const alpha = my - beta * mg;
  let sr = 0;
  for (const p of series) sr += p.w * (p.y - (alpha + beta * p.g)) ** 2;
  return [alpha, beta, Math.sqrt(sr / Math.max(sw, 1e-9))];
}

interface TrophyData {
  // Trend view (logit of the rate on the concave clock).
  trendBeta: number; lastLogit: number; residSd: number;
  // CDF view (earners as a lognormal completion curve).
  cdfOk: boolean; cdfMu: number; cdfSigma: number; cdfE: number;
  earners: number; lastRate: number; zeros: number; seen: number; eCount: number;
}

/**
 * Fit earners(t) = E * Phi((ln t - mu) / sigma) for one trophy.
 * For each sigma on the grid, mu and E follow from least squares on the
 * probit scale (mu) and the count scale (E); the best weighted fit wins.
 * t is days since the first read (+0.02 so ln t is finite).
 */
function fitCdf(points: Array<{ t: number; e: number; w: number }>): { mu: number; sigma: number; E: number } | null {
  if (points.length < 3) return null;
  let best: { mu: number; sigma: number; E: number; sse: number } | null = null;
  for (const sigma of CDF_SIGMAS) {
    // mu: least squares of ln t - sigma * Phi^-1(e / EmaxGuess)... probit
    // needs a scale first; use two passes: E from the largest counts.
    const eMax = Math.max(...points.map((p) => p.e));
    // Invert phi approximately via a rational approximation (Acklam).
    const phiInv = (p: number): number => {
      const pc = Math.min(0.999999, Math.max(0.000001, p));
      const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285984469534e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
      const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
      const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
      const dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
      const plow = 0.02425;
      if (pc < plow) {
        const q = Math.sqrt(-2 * Math.log(pc));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1);
      }
      if (pc > 1 - plow) {
        const q = Math.sqrt(-2 * Math.log(1 - pc));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1);
      }
      const q = pc - 0.5;
      const r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    };
    // First pass with E0 = eMax / Phi((ln tMax - mu0)/sigma) is circular;
    // instead fit mu by regressing ln t on probit(e / (1.15 * eMax)).
    const scale = 1.15 * eMax;
    let sw = 0, sz = 0, sl = 0;
    for (const p of points) {
      const z = phiInv(Math.min(0.995, p.e / scale));
      sw += p.w; sz += p.w * z; sl += p.w * Math.log(p.t);
    }
    const mz = sz / sw, ml = sl / sw;
    let szz = 0, szl = 0;
    for (const p of points) {
      const z = phiInv(Math.min(0.995, p.e / scale));
      szz += p.w * (z - mz) ** 2; szl += p.w * (z - mz) * (Math.log(p.t) - ml);
    }
    const slope = szz > 1e-9 ? szl / szz : sigma; // d(ln t)/dz, should be ~ sigma
    const mu = ml - (slope > 0 ? slope : sigma) * mz;
    // E by least squares on counts given mu, sigma.
    let num = 0, den = 0;
    for (const p of points) {
      const f = phi((Math.log(p.t) - mu) / sigma);
      num += p.w * f * p.e; den += p.w * f * f;
    }
    if (den <= 1e-12) continue;
    const E = Math.max(num / den, eMax);
    let sse = 0;
    for (const p of points) {
      const pred = E * phi((Math.log(p.t) - mu) / sigma);
      sse += p.w * (p.e - pred) ** 2;
    }
    if (best === null || sse < best.sse) best = { mu, sigma, E, sse };
  }
  return best;
}

/** Forecast the tracked-player count at gTarget with a saturating curve. */
function forecastPlayers(hist: Read[], t0: number, tTargetDays: number, halfLife: number, tLast: number): number {
  const pts = hist.map((r) => ({
    t: (Date.parse(r.at) - t0) / 86_400_000 + 0.02,
    n: r.players_tracked,
    w: Math.pow(0.5, (tLast - Date.parse(r.at)) / 86_400_000 / halfLife),
  }));
  const nLast = pts[pts.length - 1].n;
  let best: { nInf: number; tau: number; sse: number } | null = null;
  for (const tau of N_TAUS) {
    // n(t) = nInf - (nInf - n0) * exp(-t/tau); linear in nInf given n0 = first.
    const n0 = pts[0].n;
    let num = 0, den = 0;
    for (const p of pts) {
      const k = 1 - Math.exp(-p.t / tau);
      num += p.w * k * (p.n - n0 * Math.exp(-p.t / tau));
      den += p.w * k * k;
    }
    if (den <= 1e-12) continue;
    const nInf = Math.max(num / den, nLast);
    let sse = 0;
    for (const p of pts) sse += p.w * (p.n - (nInf - (nInf - n0) * Math.exp(-p.t / tau))) ** 2;
    if (best === null || sse < best.sse) best = { nInf, tau, sse };
  }
  if (best === null) return nLast;
  const n0 = pts[0].n;
  return Math.max(nLast, best.nInf - (best.nInf - n0) * Math.exp(-tTargetDays / best.tau));
}

function forecastCase(c: Case): Array<{ id: number; q: number[] }> {
  const hist = c.history;
  if (hist.length === 0) throw new Error('case has no history');
  const t0 = Date.parse(hist[0].at);
  const tLast = Date.parse(hist[hist.length - 1].at);
  const horizonDays = c.horizon_minutes / 1440;
  const spanDays = Math.max((tLast - t0) / 86_400_000, 0);
  const gTarget = clock(spanDays + horizonDays);
  const halfLife = Math.max(0.75, spanDays / 3);
  const weight = (at: string): number => Math.pow(0.5, ((tLast - Date.parse(at)) / 86_400_000) / halfLife);

  const nHat = forecastPlayers(hist, t0, spanDays + horizonDays + 0.02, halfLife, tLast);

  // First pass: per-trophy trend fits and CDF earner fits.
  const data: TrophyData[] = c.trophies.map((t, i) => {
    const series: Array<{ g: number; y: number; w: number }> = [];
    const ePts: Array<{ t: number; e: number; w: number }> = [];
    let lastRate = 0, zeros = 0, seen = 0;
    for (const r of hist) {
      const rate = r.rates[i];
      if (rate === null || rate === undefined) continue;
      seen++;
      lastRate = rate;
      if (rate <= 0) { zeros++; continue; }
      const days = (Date.parse(r.at) - t0) / 86_400_000;
      const w = weight(r.at);
      series.push({ g: clock(days), y: logit(rate), w });
      const e = (rate / 100) * r.players_tracked;
      if (e >= 1) ePts.push({ t: days + 0.02, e, w });
    }
    const last = hist[hist.length - 1];
    const earners = Math.round(((last.rates[i] ?? 0) / 100) * last.players_tracked);
    const [, beta, residSd] = series.length >= 2 ? fitLine(series) : [0, 0, 0.35];
    const cdf = fitCdf(ePts);
    return {
      trendBeta: beta, lastLogit: logit(Math.max(lastRate, 0.01)), residSd,
      cdfOk: cdf !== null, cdfMu: cdf?.mu ?? 0, cdfSigma: cdf?.sigma ?? 1.1, cdfE: cdf?.E ?? 0,
      earners, lastRate, zeros, seen, eCount: ePts.length,
    };
  });

  // Pooled values for shrinkage.
  const movers = data.filter((d) => d.seen >= 4 && d.zeros < d.seen);
  const pooledBeta = movers.length > 0 ? movers.reduce((s, d) => s + d.trendBeta, 0) / movers.length : 0;
  const sigmas = data.filter((d) => d.cdfOk).map((d) => d.cdfSigma).sort((a, b) => a - b);
  const medianSigma = sigmas.length > 0 ? sigmas[Math.floor(sigmas.length / 2)] : 1.1;

  const tTarget = spanDays + horizonDays + 0.02;
  return c.trophies.map((t, i) => {
    const d = data[i];
    if (d.seen > 0 && d.zeros === d.seen) {
      const base = t.tier === 'platinum' ? [0.01, 0.01, 0.02, 0.05, 0.15] : [0.01, 0.02, 0.05, 0.14, 0.45];
      return { id: t.id, q: base.map(round4) };
    }
    // Trend view.
    const trust = Math.min(1, d.seen / (d.seen + 10));
    const beta = trust * d.trendBeta + (1 - trust) * pooledBeta;
    const trendLogit = d.lastLogit + beta * (gTarget - clock(spanDays));
    let medLogit = trendLogit;
    // CDF view: earners at target over players at target.
    if (d.cdfOk && d.earners >= 3) {
      const sigma = 0.5 * d.cdfSigma + 0.5 * medianSigma;
      const eHat = Math.min(d.cdfE * phi((Math.log(tTarget) - d.cdfMu) / sigma), nHat);
      const cdfRate = clampPct(100 * eHat / nHat);
      medLogit = 0.65 * logit(cdfRate) + 0.35 * trendLogit;
    }
    // Spread: binomial noise + fit scatter + horizon.
    const n = Math.max(hist[hist.length - 1].players_tracked, 1);
    const binom = Math.sqrt(1 / Math.max(d.earners, 1) + 1 / Math.max(n - d.earners, 1));
    const sigma = Math.min(SIGMA_CAP, Math.sqrt(SIGMA_BASE ** 2 + (SIGMA_PER_SQRT_DAY * Math.sqrt(horizonDays)) ** 2 + (0.6 * d.residSd) ** 2 + binom ** 2));
    const q = Z.map((z) => round4(invLogit(medLogit + z * sigma)));
    for (let k = 1; k < q.length; k++) if (q[k] < q[k - 1]) q[k] = q[k - 1];
    return { id: t.id, q };
  });
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
    throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}, not ${JSON.stringify(LEVELS)}`);
  }
  const trophies = forecastCase(c);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ trophies })}\n`);
}
