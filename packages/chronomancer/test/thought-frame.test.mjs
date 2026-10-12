import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { jiti, source, root, theme, initTheme, plain, visibleWidth } = await import(pathToFileURL(join(directory, '../../extensions/pi-home/tests/host.mjs')));
const { renderThought, thoughtColor } = await jiti.import(join(directory, 'extensions/thought-frame.ts'));
const { localDay } = await jiti.import(join(directory, 'extensions/journal.ts'));
const { SentMessageFrames } = await jiti.import(join(source, 'sent-messages.ts'));
const { userFrameColor } = await jiti.import(join(source, 'composer-style.ts'));
const { UserMessageComponent } = await import(pathToFileURL(join(root, '@earendil-works/pi-coding-agent/dist/index.js')));
const { Container, colorToHex } = await import(pathToFileURL(join(root, '@earendil-works/pi-tui/dist/index.js')));

function thought(timestamp = Date.now(), depth = 1, day = localDay(new Date(timestamp)), visit = false) {
  return { id: '1', depth, body: 'Hello **Pi**\n\nAnother line', createdAt: new Date(timestamp).toISOString(), day, visit };
}

test('silent red capture matches Home’s visible sent user frame and color', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    const timestamp = Date.now(), data = thought(timestamp);
    const native = new UserMessageComponent(data.body), rootNode = new Container(), frames = new SentMessageFrames();
    rootNode.addChild(native);
    frames.sync(rootNode, () => theme, undefined, undefined, () => ({
      prefs: { timestamps: '24h', icons: 'nerd' }, users: [{ text: data.body, timestamp }],
    }));
    try {
      assert.equal(colorToHex(thoughtColor(theme, 1)), colorToHex(userFrameColor(theme)));
      for (const width of [40, 90, 140]) {
        const actual = renderThought(data, theme, width), normal = native.render(width);
        assert.deepEqual(actual.map(plain), normal.map(plain), `same visible framing, speaker, Sent label and native body at ${width} / ${appearance}`);
      }
    } finally { frames.dispose(); }
  }
});

test('rewinding a red root shows the same orange frame as an orange child without changing saved depth', () => {
  for (const appearance of ['dark', 'light']) {
    initTheme(appearance, false);
    const red = thought(), visit = { ...red, visit: true }, orange = { ...red, depth: 2 };
    const captured = renderThought(red, theme, 90), revisited = renderThought(visit, theme, 90);
    assert.equal(red.depth, 1);
    assert.notEqual(revisited[1], captured[1], 'rewind changes the frame color');
    assert.equal(revisited[1], renderThought(orange, theme, 90)[1], 'revisit uses the orange stage color');
    assert.match(plain(revisited[0]), /↶ jordan/);
    for (const width of [12, 20, 40, 90]) {
      for (const line of renderThought(visit, theme, width)) assert.ok(visibleWidth(line) <= width);
    }
  }
});

test('imported legacy thoughts with unknown creation time do not invent a Sent label', () => {
  initTheme('dark', false);
  const old = { ...thought(), createdAt: null, day: '2020-01-02' };
  const rendered = renderThought(old, theme, 90).map(plain).join('\n');
  assert.ok(!rendered.includes('1970-01-01'));
  assert.ok(!rendered.includes('Sent'));
});

test('stage colors change the same frame; a past-day thought shows actual creation date', () => {
  initTheme('dark', false);
  const written = Date.now(), oldDay = '2024-01-02';
  const red = thought(written), blue = thought(written, 5, oldDay), visit = { ...blue, visit: true };
  const base = renderThought(red, theme, 90), deep = renderThought(blue, theme, 90);
  assert.notEqual(base[0], deep[0], 'border changes with depth');
  assert.match(plain(base[0]), /jordan/);
  assert.match(plain(deep[0]), /jordan/);
  assert.ok(plain(deep.at(-1)).includes(localDay(new Date(written))), 'Sent shows real date, not selected old day');
  assert.match(plain(renderThought(visit, theme, 90)[0]), /↶ jordan/, 'revisits remain distinguishable');
  for (const width of [4, 8, 11, 12, 20, 32, 48, 90]) {
    for (const line of renderThought(blue, theme, width)) assert.ok(visibleWidth(line) <= width, `overflow at ${width}`);
  }
});
