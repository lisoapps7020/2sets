import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineChart, radarChart } from '../js/charts.js';
import { quoteFor, QUOTES } from '../js/quotes.js';

test('lineChart renders a polyline and one dot per point', () => {
  const svg = lineChart([{ date: '2026-09-01', value: 20 }, { date: '2026-09-08', value: 25 }, { date: '2026-09-15', value: 25 }], { unit: 'kg' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /<polyline/);
  assert.equal((svg.match(/<circle/g) || []).length, 3);
  assert.match(svg, /1 sep/);
  assert.match(svg, /15 sep/);
  assert.match(svg, /25 kg/);
});

test('lineChart with a single point draws a dot and no polyline', () => {
  const svg = lineChart([{ date: '2026-09-01', value: 20 }]);
  assert.equal((svg.match(/<circle/g) || []).length, 1);
  assert.doesNotMatch(svg, /<polyline/);
});

test('lineChart handles empty and flat series', () => {
  assert.match(lineChart([]), /Sin datos/);
  const flat = lineChart([{ date: '2026-09-01', value: 5 }, { date: '2026-09-02', value: 5 }]);
  assert.match(flat, /<polyline/);
  assert.doesNotMatch(flat, /NaN/);
});

test('lineChart escapes nothing dangerous and respects size', () => {
  const svg = lineChart([{ date: '2026-09-01', value: 1 }], { width: 300, height: 120 });
  assert.match(svg, /viewBox="0 0 300 120"/);
});

test('quoteFor is deterministic per date and covers the list', () => {
  assert.deepEqual(quoteFor('2026-09-24'), quoteFor('2026-09-24'));
  assert.ok(quoteFor('2026-09-24').text.length > 10);
  assert.ok(quoteFor('2026-09-24').author.length > 3);
  assert.ok(QUOTES.length >= 20);
  const seen = new Set();
  for (let d = 1; d <= 28; d++) seen.add(quoteFor(`2026-02-${String(d).padStart(2, '0')}`).text);
  assert.ok(seen.size >= 10);
});

test('flat series labels the real max, not the padded axis', () => {
  const svg = lineChart([{ date: '2026-09-01', value: 5 }, { date: '2026-09-02', value: 5 }], { unit: 'kg' });
  assert.doesNotMatch(svg, /6 kg/);
  assert.match(svg, /5 kg/);
});

// ---- radarChart ----
const SIX = [
  { label: 'Tirón', value: 62 },
  { label: 'Empuje', value: 40 },
  { label: 'Pierna', value: 80 },
  { label: 'Core', value: 55 },
  { label: 'Cardio', value: 30 },
  { label: 'Movilidad', value: 70 },
];
const tagsOf = (svg, tag) => svg.match(new RegExp(`<${tag}[^>]*>`, 'g')) || [];
const textsOf = (svg) => svg.match(/<text[^>]*>.*?<\/text>/g) || [];

test('radarChart with 6 items draws grid, axes, one data polygon, dots and labels', () => {
  const svg = radarChart(SIX);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Atributos"/);
  assert.equal(tagsOf(svg, 'polygon').length, 5);
  const data = tagsOf(svg, 'polygon').filter((p) => p.includes('fill="var(--primary)"'));
  assert.equal(data.length, 1);
  assert.match(data[0], /fill-opacity="0.35"/);
  assert.match(data[0], /stroke="var\(--primary\)"/);
  assert.match(data[0], /stroke-width="2"/);
  assert.equal(tagsOf(svg, 'line').length, 6);
  assert.equal(tagsOf(svg, 'circle').length, 6);
  for (const c of tagsOf(svg, 'circle')) {
    assert.match(c, /r="3"/);
    assert.match(c, /fill="var\(--gold\)"/);
  }
  const labels = textsOf(svg);
  assert.equal(labels.length, 6);
  const tiron = labels.find((t) => t.includes('Tirón'));
  assert.ok(tiron, 'Tirón label present');
  assert.match(tiron, /<tspan[^>]*>62<\/tspan>/);
  assert.match(tiron, /font-size="11"/);
  assert.match(tiron, /fill="var\(--ink\)"/);
});

test('radarChart null value mutes its label, hides the number and keeps 6 polygon points', () => {
  const items = SIX.map((d, i) => (i === 1 ? { ...d, value: null } : d));
  const svg = radarChart(items);
  const data = tagsOf(svg, 'polygon').filter((p) => p.includes('fill="var(--primary)"'));
  assert.equal(data.length, 1);
  const pts = data[0].match(/points="([^"]+)"/)[1].trim().split(/\s+/);
  assert.equal(pts.length, 6);
  for (const p of pts) assert.match(p, /^-?\d+(\.\d)?,-?\d+(\.\d)?$/);
  const muted = textsOf(svg).filter((t) => t.includes('class="muted"'));
  assert.equal(muted.length, 1);
  assert.match(muted[0], /Empuje/);
  assert.match(muted[0], /fill="var\(--ink-muted\)"/);
  assert.doesNotMatch(muted[0], /<tspan/);
  assert.equal(tagsOf(svg, 'circle').length, 6);
});

test('radarChart viewBox respects size and defaults to 300', () => {
  assert.match(radarChart(SIX, { size: 240 }), /viewBox="0 0 240 240"/);
  assert.match(radarChart(SIX), /viewBox="0 0 300 300"/);
});

test('radarChart with fewer than 3 items shows the empty message', () => {
  assert.match(radarChart([]), /Sin datos/);
  assert.match(radarChart(SIX.slice(0, 2)), /Sin datos/);
  assert.match(radarChart(undefined), /Sin datos/);
  assert.doesNotMatch(radarChart(SIX.slice(0, 2)), /<polygon/);
});

test('radarChart never emits NaN for a mix of null and numbers, from 3 to 8 items', () => {
  const eight = [
    { label: 'A', value: 10 }, { label: 'B', value: null }, { label: 'C', value: 100 }, { label: 'D', value: null },
    { label: 'E', value: 0 }, { label: 'F', value: 33.3 }, { label: 'G', value: undefined }, { label: 'H', value: 'x' },
  ];
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const svg = radarChart(eight.slice(0, n));
    assert.doesNotMatch(svg, /NaN/);
    assert.equal(tagsOf(svg, 'line').length, n);
    assert.equal(tagsOf(svg, 'circle').length, n);
    assert.equal(tagsOf(svg, 'polygon').length, 5);
  }
});

test('radarChart starts at the top and goes clockwise, rounding to 1 decimal', () => {
  // size 300 -> center 150, radius 300/2 - 34 = 116
  const svg = radarChart(SIX.map((d, i) => ({ ...d, value: i < 2 ? 100 : 0 })));
  const dots = tagsOf(svg, 'circle');
  assert.match(dots[0], /cx="150\.0"/);
  assert.match(dots[0], /cy="34\.0"/);
  assert.match(dots[1], /cx="250\.5"/);
  assert.match(dots[1], /cy="92\.0"/);
});

test('radarChart picks text-anchor by angle', () => {
  const labels = textsOf(radarChart(SIX));
  const anchorOf = (name) => labels.find((t) => t.includes(name)).match(/text-anchor="(\w+)"/)[1];
  assert.equal(anchorOf('Tirón'), 'middle');
  assert.equal(anchorOf('Empuje'), 'start');
  assert.equal(anchorOf('Core'), 'middle');
  assert.equal(anchorOf('Cardio'), 'end');
});
