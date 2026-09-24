import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../js/version.js';

test('APP_VERSION matches the service worker VERSION', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const m = sw.match(/const VERSION = 'v([^']+)'/);
  assert.ok(m, 'sw.js debe declarar VERSION');
  assert.equal(m[1], APP_VERSION);
});
