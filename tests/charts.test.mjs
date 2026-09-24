import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineChart } from '../js/charts.js';
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
