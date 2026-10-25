import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jiti, source, theme, initTheme, plain } from './host.mjs';
import { join } from 'node:path';
const { calendarDay, sentTime, sentLabel, styledSentLabel } = await jiti.import(join(source, 'sent-metadata.ts'));
const { COMPOSER_ICONS } = await jiti.import(join(source, 'composer-icons.ts'));

test('sourced Sent metadata shares formatting without inventing missing time', () => {
  const now = Date.UTC(2025, 0, 1, 12, 0), at = now - 60_000 + 7_123;
  for (const format of ['12h', '24h', 'relative']) {
    const expected = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: format === '12h' });
    assert.equal(sentTime(at, { timestamps: format }, now), expected);
    assert.equal(sentLabel(sentTime(at, { timestamps: format }, now), 'plain'), ` Sent ${expected} `);
    assert.equal(sentLabel(expected), ` ${COMPOSER_ICONS.sent} ${expected} `);
    assert.doesNotMatch(expected, /\.123/);
  }
  const yesterday = at - 86_400_000;
  assert.match(sentTime(yesterday, { timestamps: '24h' }, now), /\d{2}:\d{2}:\d{2}/);
  assert.equal(sentTime(at, { timestamps: '24h' }, now, true), `${calendarDay(at)} ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`);
  assert.equal(sentTime(undefined, { timestamps: '24h' }, now, true), '', 'no invented timestamp');
  for (const at of [undefined, NaN, -1]) {
    assert.equal(sentTime(at, undefined, now), '');
    assert.equal(sentLabel(sentTime(at, undefined, now)), '');
  }
});

test('user and assistant/group Sent metadata share text but preserve different tones', () => {
  for (const appearance of ['light', 'dark']) {
    initTheme(appearance, false);
    const user = styledSentLabel(theme, '12:00', theme.colors.error, 'user', 'plain');
    const quiet = styledSentLabel(theme, '12:00', theme.colors.error, 'quiet', 'plain');
    assert.equal(plain(user), ' Sent 12:00 ');
    assert.equal(plain(quiet), plain(user));
    assert.notEqual(user, quiet);
    assert.equal(plain(styledSentLabel(theme, '12:00:07', theme.colors.error, 'user', 'nerd')), ` ${COMPOSER_ICONS.sent} 12:00:07 `);
    assert.equal(styledSentLabel(theme, '', theme.colors.error, 'user'), '');
  }
});
