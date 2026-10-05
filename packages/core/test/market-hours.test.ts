import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usMarketSession } from '../src/index.ts';

const ny = (iso: string) => Date.parse(iso); // ISO strings with an explicit -04:00 / -05:00 offset

test('US market sessions follow New York time', () => {
  assert.equal(usMarketSession(ny('2026-10-01T10:00:00-04:00')).session, 'regular');
  assert.equal(usMarketSession(ny('2026-10-01T08:00:00-04:00')).session, 'pre-market');
  assert.equal(usMarketSession(ny('2026-10-01T17:00:00-04:00')).session, 'after-hours');
  assert.equal(usMarketSession(ny('2026-10-01T21:00:00-04:00')).session, 'closed');
  assert.equal(usMarketSession(ny('2026-10-03T12:00:00-04:00')).session, 'closed'); // Saturday
});

test('holidays and early closes', () => {
  const t = usMarketSession(ny('2026-11-26T11:00:00-05:00'));
  assert.equal(t.session, 'closed');
  assert.equal(t.holiday, 'Thanksgiving Day');
  assert.equal(usMarketSession(ny('2026-11-27T12:30:00-05:00')).session, 'regular');
  assert.equal(usMarketSession(ny('2026-11-27T13:30:00-05:00')).session, 'after-hours');
});

test('next change points at the next open', () => {
  const fridayNight = usMarketSession(ny('2026-10-02T18:00:00-04:00'));
  assert.equal(fridayNight.nextChange, ny('2026-10-05T09:30:00-04:00'));
});
