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
  const dataMax = max;
  const flat = min === max;
  if (flat) { min -= 1; max += 1; }
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
  if (!flat) parts.push(`<text x="${w - padX}" y="${y(dataMax) - 4}" text-anchor="end" font-size="10" fill="var(--ink-muted)">${label(dataMax)}</text>`);
  parts.push('</svg>');
  return parts.join('');
}

// Gráfico de radar (araña) en SVG. `values` = [{ label, value|null }], 3..8 ejes.
// Primer eje arriba (-90°) y sentido horario. Devuelve un string SVG.
export function radarChart(values, { size = 300 } = {}) {
  const s = Number(size) || 300;
  const items = Array.isArray(values) ? values : [];
  if (items.length < 3) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" role="img" aria-label="Sin datos"><text x="${s / 2}" y="${s / 2}" text-anchor="middle" font-size="14" fill="var(--ink-muted)">Sin datos todavía</text></svg>`;
  }
  const n = items.length;
  const cx = s / 2, cy = s / 2;
  const r = s / 2 - 34; // hueco para las etiquetas
  const f = (v) => v.toFixed(1);
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, radius) => [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
  const ring = (radius) => items.map((_, i) => pt(i, radius).map(f).join(',')).join(' ');
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  // null/undefined/no numérico -> null (se dibuja en el centro y la etiqueta va atenuada)
  const vals = items.map((d) => {
    const raw = d ? d.value : null;
    if (raw === null || raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  });
  const coords = vals.map((v, i) => pt(i, (r * Math.min(100, Math.max(0, v ?? 0))) / 100));
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" role="img" aria-label="Atributos">`);
  for (const pct of [25, 50, 75, 100]) {
    parts.push(`<polygon fill="none" stroke="var(--border)" stroke-width="${pct === 100 ? 1.5 : 1}" points="${ring((r * pct) / 100)}"/>`);
  }
  for (let i = 0; i < n; i++) {
    const [x2, y2] = pt(i, r);
    parts.push(`<line x1="${f(cx)}" y1="${f(cy)}" x2="${f(x2)}" y2="${f(y2)}" stroke="var(--border)" stroke-width="1"/>`);
  }
  parts.push(`<polygon fill="var(--primary)" fill-opacity="0.35" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round" points="${coords.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"/>`);
  for (const [x, y] of coords) {
    parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="var(--gold)" stroke="var(--surface)" stroke-width="1"/>`);
  }
  items.forEach((d, i) => {
    const a = angle(i);
    const c = Math.cos(a), sn = Math.sin(a);
    const [lx, ly] = pt(i, r + 14);
    const anchor = c > 0.15 ? 'start' : c < -0.15 ? 'end' : 'middle';
    const ty = ly + 4 + 5 * sn; // arriba queda sobre la línea base, abajo cuelga
    const v = vals[i];
    const muted = v === null;
    const attrs = muted ? ' class="muted" fill="var(--ink-muted)"' : ' fill="var(--ink)"';
    const num = muted ? '' : ` <tspan font-size="10" font-weight="700">${fmtNum(v)}</tspan>`;
    parts.push(`<text x="${f(lx)}" y="${f(ty)}" text-anchor="${anchor}" font-size="11"${attrs}>${esc(d && d.label)}${num}</text>`);
  });
  parts.push('</svg>');
  return parts.join('');
}
