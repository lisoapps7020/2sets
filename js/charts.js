// Gráfico de líneas en SVG, sin dependencias. Devuelve un string SVG.
import { fmtShortDate, fmtNum } from './ui.js';

export function lineChart(points, { width = 320, height = 160, unit = '' } = {}) {
  const pts = (points || []).filter((p) => Number.isFinite(Number(p.value)));
  const w = Number(width) || 320;
  const h = Number(height) || 160;
  if (!pts.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Sin datos"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="14" fill="var(--ink-muted)">Sin datos todavía</text></svg>`;
  }
  const padX = 28, padTop = 24, padBottom = 26;
  const values = pts.map((p) => Number(p.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const x = (i) => (pts.length === 1 ? w / 2 : padX + (i * innerW) / (pts.length - 1));
  const y = (v) => padTop + innerH - ((v - min) / (max - min)) * innerH;
  const coords = pts.map((p, i) => [x(i), y(Number(p.value))]);
  const label = (v) => `${fmtNum(v)}${unit ? ' ' + unit : ''}`;
  const first = pts[0], last = pts[pts.length - 1];
  const lastXY = coords[coords.length - 1];
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución">`);
  parts.push(`<line x1="${padX}" y1="${y(min)}" x2="${w - padX}" y2="${y(min)}" stroke="var(--border)" stroke-width="1"/>`);
  parts.push(`<line x1="${padX}" y1="${y(max)}" x2="${w - padX}" y2="${y(max)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>`);
  if (coords.length > 1) {
    parts.push(`<polyline fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${coords.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ')}"/>`);
  }
  for (const [cx, cy] of coords) {
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="var(--gold)" stroke="var(--surface)" stroke-width="1.5"/>`);
  }
  const lx = Math.min(lastXY[0], w - padX);
  const anchor = pts.length === 1 ? 'middle' : 'end';
  parts.push(`<text x="${lx.toFixed(1)}" y="${Math.max(12, lastXY[1] - 10).toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="700" fill="var(--ink)">${label(last.value)}</text>`);
  parts.push(`<text x="${padX}" y="${h - 8}" font-size="11" fill="var(--ink-muted)">${fmtShortDate(first.date)}</text>`);
  if (pts.length > 1) parts.push(`<text x="${w - padX}" y="${h - 8}" text-anchor="end" font-size="11" fill="var(--ink-muted)">${fmtShortDate(last.date)}</text>`);
  parts.push(`<text x="${w - padX}" y="${y(max) - 4}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${label(max)}</text>`);
  parts.push('</svg>');
  return parts.join('');
}
