import { CAGR_SCALE, type CagrRating as Rating } from '@market-reader/core';

const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`);
const tone = (v: number | null) => (v === null ? '' : v >= 0 ? 'up' : 'down');

/** Grade color: A/B green, C neutral, D/F red. */
const GRADE_CLASS: Record<string, string> = {
  A: 'bg-up-tint text-up border-up', B: 'bg-up-tint text-up border-up', C: 'bg-fog text-ink border-rule',
  D: 'bg-down-tint text-down border-down', F: 'bg-down-tint text-down border-down',
};

export interface TrendInputs { pastYearAnnualPct: number; longRunCagrPct: number | null; longRunWeight: number; projectedAnnualPct: number }

/**
 * CAGR rating card shown with every price projection: grade, growth per year over 1/3/5/10 years,
 * comparison with the S&P 500, steadiness, and how the long-run rate anchors the projected trend.
 */
export function CagrRating({ cagr, trend }: { cagr: Rating; trend?: TrendInputs }) {
  const g = cagr.grade;
  return (
    <div className="border-b border-rule-soft px-4 py-3" aria-labelledby="cagr-title">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border text-2xl font-bold ${g ? GRADE_CLASS[g] : 'border-rule bg-fog text-muted'}`}
          aria-label={g ? `CAGR rating ${g}` : 'No CAGR rating'}
        >
          {g ?? '–'}
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="cagr-title" className="text-[15px] font-semibold">
            CAGR rating{g ? `: ${cagr.label}` : ''}
          </h3>
          <p className="text-sm text-muted">{cagr.summary}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
        {cagr.periods.map((p) => (
          <div key={p.years} className={`rounded-md border px-1 py-1.5 ${p.years === cagr.basisYears ? 'border-accent' : 'border-rule-soft'}`}>
            <dt className="text-xs text-muted">{p.years} yr{p.years > 1 ? 's' : ''}</dt>
            <dd className={`font-semibold tabular-nums ${tone(p.cagrPct)}`} title={p.startDate ? `Since ${p.startDate}` : 'Not enough history'}>
              {pct(p.cagrPct)}
            </dd>
          </div>
        ))}
      </dl>

      {trend && (
        <p className="mt-2 text-xs text-muted">
          <strong className="text-ink">How it shapes these ranges:</strong>{' '}
          {trend.longRunWeight > 0 ? (
            <>
              the expected trend blends the past year ({pct(trend.pastYearAnnualPct)} a year) with the long-run CAGR ({pct(trend.longRunCagrPct)} a year,{' '}
              {Math.round(trend.longRunWeight * 100)}% weight), then halves it to stay cautious: {pct(trend.projectedAnnualPct)} a year at the middle of the ranges.
            </>
          ) : (
            <>no long-run growth rate is available, so the trend comes from the past year alone ({pct(trend.projectedAnnualPct)} a year after halving).</>
          )}
        </p>
      )}
      <p className="mt-1 text-xs text-muted">
        Scale: {CAGR_SCALE.map((s) => `${s.grade} ${Number.isFinite(s.min) ? `≥${s.min}%` : '<0%'}`).join(' · ')} a year. Past growth doesn&rsquo;t guarantee future growth.
      </p>
    </div>
  );
}
