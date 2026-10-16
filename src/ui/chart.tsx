import { useState } from 'preact/hooks';
import { daysBetween, fmtDay, addDays, type Day } from '../lib/date';
import { useWidth } from './components';

export interface Series {
  label: string;
  kind: 'line' | 'dots' | 'bars' | 'step';
  points: { d: Day; v: number }[];
  color?: string;
  dashed?: boolean;
}

function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

export function TimeChart({ start, end, series, height = 190, fmt = (v) => String(Math.round(v)), zero = false, unit = '' }: {
  start: Day; end: Day; series: Series[]; height?: number; fmt?: (v: number) => string; zero?: boolean; unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(1, daysBetween(start, end) + 1);
  const all = series.flatMap((s) => s.points.filter((p) => p.d >= start && p.d <= end).map((p) => p.v));
  const hasBars = series.some((s) => s.kind === 'bars');
  const w = Math.max(width, 100);
  const inset = hasBars ? Math.max(4, Math.min(10, ((w - 44) / n) * 0.4)) : 4;
  const padL = inset, padR = 40 + inset, padT = 8, padB = 22;
  const plotW = w - padL - padR, plotH = height - padT - padB;

  let lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
  if (zero) lo = Math.min(0, lo);
  if (hi - lo < 1e-6) { hi += 1; lo -= zero ? 0 : 1; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (!zero) { lo -= step * 0.25; hi += step * 0.25; }
  const x = (d: Day) => padL + (n === 1 ? plotW / 2 : (daysBetween(start, d) / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(t);
  const labelCount = Math.min(n, w < 360 ? 4 : 5);
  const xLabels = Array.from({ length: labelCount }, (_, i) => addDays(start, Math.round((i * (n - 1)) / Math.max(1, labelCount - 1))));
  const barW = Math.max(1.5, Math.min(14, (plotW / n) * 0.62));

  const onMove = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left - padL;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
  };
  const hoverDay = hover != null ? addDays(start, hover) : null;

  return (
    <div ref={ref}>
      <div class="chart-readout">
        {hoverDay ? (
          <>
            <span>{fmtDay(hoverDay, { weekday: true })}</span>
            <span>
              {series.map((s) => {
                const p = s.points.find((q) => q.d === hoverDay);
                return p ? <span key={s.label} style={{ marginLeft: 12 }}>{s.label} <b style={{ color: 'var(--ink)' }}>{fmt(p.v)}{unit}</b></span> : null;
              })}
            </span>
          </>
        ) : <span class="faint">Touch the chart for daily values</span>}
      </div>
      {width > 0 && (
        <svg class="chart" width={w} height={height} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line class="grid" x1={padL - inset + 4} x2={w - 40} y1={y(t)} y2={y(t)} />
              <text x={w - 34} y={y(t) + 3}>{fmt(t)}</text>
            </g>
          ))}
          {xLabels.map((d, i) => (
            <text key={d + i} x={x(d)} y={height - 6} text-anchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>{fmtDay(d)}</text>
          ))}
          {series.map((s) => {
            const pts = s.points.filter((p) => p.d >= start && p.d <= end);
            const color = s.color ?? 'var(--ink)';
            if (s.kind === 'bars') {
              return <g key={s.label}>{pts.map((p) => (
                <rect key={p.d} x={x(p.d) - barW / 2} y={Math.min(y(p.v), y(Math.max(lo, 0)))} width={barW}
                  height={Math.abs(y(Math.max(lo, 0)) - y(p.v))} rx={Math.min(2, barW / 3)} fill={color} opacity={hoverDay && hoverDay !== p.d ? 0.45 : 1} />
              ))}</g>;
            }
            if (s.kind === 'dots') {
              return <g key={s.label}>{pts.map((p) => <circle key={p.d} cx={x(p.d)} cy={y(p.v)} r={n > 120 ? 1.6 : 2.4} fill={color} opacity={0.4} />)}</g>;
            }
            if (!pts.length) return null;
            let d = '';
            pts.forEach((p, i) => {
              if (s.kind === 'step' && i > 0) d += `H${x(p.d) - (plotW / n) / 2}V${y(p.v)}`;
              else d += `${i ? 'L' : 'M'}${x(p.d)},${y(p.v)}`;
            });
            if (s.kind === 'step') d += `H${x(pts[pts.length - 1].d) + (plotW / n) / 2}`;
            return <path key={s.label} d={d} fill="none" stroke={color} stroke-width={s.kind === 'step' ? 1.2 : 2} stroke-dasharray={s.dashed ? '4 3' : undefined} stroke-linejoin="round" stroke-linecap="round" />;
          })}
          {hoverDay && <line x1={x(hoverDay)} x2={x(hoverDay)} y1={padT} y2={padT + plotH} stroke="var(--line-strong)" stroke-width="1" />}
        </svg>
      )}
      {series.length > 1 && (
        <div class="legend">
          {series.map((s) => (
            <span key={s.label}><i style={{
              background: s.color ?? 'var(--ink)',
              height: s.kind === 'dots' ? 6 : s.kind === 'bars' ? 8 : 2,
              width: s.kind === 'dots' ? 6 : s.kind === 'bars' ? 8 : 10,
              borderRadius: s.kind === 'dots' ? 3 : s.kind === 'bars' ? 2 : 0,
              opacity: s.kind === 'dots' ? 0.5 : 1,
            }} />{s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
