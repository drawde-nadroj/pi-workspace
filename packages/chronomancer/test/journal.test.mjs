import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournal, connectJournal, openLocalJournal, list, loadProgress, saveProgress, localDay, store, validateDay } from '../extensions/journal.ts';

const fixture = () => mkdtempSync(join(tmpdir(), 'chronomancer-'));
test('create or reconnect; day files are independent of Pi and start only on first thought', async () => {
  const root = fixture(), directory = join(root, 'chronomancer');
  try {
    const created = await createJournal(directory);
    assert.equal((await connectJournal(directory)).id, created.id);
    assert.deepEqual((await list(created, '2026-09-30')).entries, []);
    assert.throws(() => readFileSync(join(directory, '2026-09-30.md')), { code: 'ENOENT' });
    const now = new Date('2026-10-10T16:20:12.000Z');
    const first = await store(created, '2026-09-30', 'First red', undefined, now);
    const second = await store(created, '2026-09-30', 'Second red', undefined, now);
    const orange = await store(created, '2026-09-30', 'Orange child', first.id, now);
    let chain = orange;
    for (let depth = 3; depth <= 5; depth++) chain = await store(created, '2026-09-30', `Depth ${depth}`, chain.id, now);
    const entries = (await list(created, '2026-09-30')).entries;
    assert.deepEqual(entries.map(e => e.id), [first.id, orange.id, entries[2].id, entries[3].id, chain.id, second.id]);
    assert.equal(chain.root, first.id);
    assert.equal(chain.createdAt, now.toISOString());
    assert.equal(entries[5].parent, null);
    assert.match(readFileSync(join(directory, '2026-09-30.md'), 'utf8'), /<!-- chronomancer:created-at=2026-10-10T16:20:12.000Z -->/);
    assert.deepEqual((await list(created, '2026-10-10')).entries, []);
    const legacyPath = join(directory, '2026-09-30.md');
    writeFileSync(legacyPath, readFileSync(legacyPath, 'utf8')
      .replace(/^(# )(\d\d:\d\d:)\d\d$/m, '$1$2/example/screenshot.png')
      .replace('First red', 'First red\n```md\n## fenced heading\n```')
      .replace(/<!-- chronomancer:created-at=2026-10-10T16:20:12.000Z -->/,
        '<!-- chronomancer:created-at=unknown -->'));
    const legacy = (await list(created, '2026-09-30')).entries[0];
    assert.equal(legacy.createdAt, null, 'legacy creation time is never fabricated');
    assert.match(legacy.legacyTitle, /\/example\/screenshot\.png$/, 'an irregular original heading remains recoverable');
    assert.match(legacy.body, /## fenced heading/, 'Markdown inside fences is not a structural entry');
    assert.equal((await store(created, '2026-09-30', 'A later root')).depth, 1);
    await assert.rejects(store(created, '2026-09-30', 'Beyond blue', chain.id));
    await assert.rejects(createJournal(directory), /already exists/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('local discovery creates once, reconnects from a working directory or the journal itself, and never stamps occupied paths', async () => {
  const root = fixture(), child = join(root, 'chronomancer');
  try {
    const created = await openLocalJournal(root);
    assert.equal(created.directory, realpathSync(child));
    assert.equal((await openLocalJournal(root)).id, created.id);
    assert.equal((await openLocalJournal(child)).id, created.id);
    assert.throws(() => readFileSync(join(child, `${localDay()}.md`)), { code: 'ENOENT' });
  } finally { rmSync(root, { recursive: true, force: true }); }
  const occupied = fixture();
  try {
    mkdirSync(join(occupied, 'chronomancer'));
    writeFileSync(join(occupied, 'chronomancer', 'keep.txt'), 'not a journal');
    await assert.rejects(openLocalJournal(occupied), /without a Chronomancer marker/);
    assert.equal(readFileSync(join(occupied, 'chronomancer', 'keep.txt'), 'utf8'), 'not a journal');
    assert.throws(() => readFileSync(join(occupied, 'chronomancer', '.chronomancer.json')), { code: 'ENOENT' });
    rmSync(join(occupied, 'chronomancer'), { recursive: true });
    symlinkSync(root, join(occupied, 'chronomancer'));
    await assert.rejects(openLocalJournal(occupied), /not a journal directory/);
  } finally { rmSync(occupied, { recursive: true, force: true }); }
});

test('refuses malformed dates, headings, foreign files, missing parents, locks and symlinks', async () => {
  const root = fixture(), directory = join(root, 'chronomancer');
  try {
    const journal = await createJournal(directory), day = '2026-10-10', path = join(directory, `${day}.md`);
    assert.equal(localDay(new Date(2026, 9, 10, 12)), day);
    assert.throws(() => validateDay('2026-02-30'), /does not exist/);
    await assert.rejects(store(journal, '../secret', 'No'), /YYYY-MM-DD/);
    await assert.rejects(store(journal, day, '# Forged heading'), /Structural/);
    await assert.rejects(store(journal, day, 'Orphan', 'missing'), /missing/);
    assert.throws(() => readFileSync(path), { code: 'ENOENT' });
    writeFileSync(`${path}.lock`, 'someone else');
    await assert.rejects(store(journal, day, 'Blocked'), /being written/);
    rmSync(`${path}.lock`);
    writeFileSync(path, '# Another document\n');
    await assert.rejects(store(journal, day, 'Blocked'), /Unexpected content/);
    assert.equal(readFileSync(path, 'utf8'), '# Another document\n');
    rmSync(path);
    symlinkSync(join(root, 'external.md'), path);
    await assert.rejects(store(journal, day, 'Blocked'), /regular file/);
    assert.throws(() => readFileSync(join(root, 'external.md')), { code: 'ENOENT' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a per-person checkpoint resumes and rejects stale updates without changing saved thoughts', async () => {
  const root = fixture();
  try {
    const journal = await createJournal(join(root, 'chronomancer'));
    const first = await store(journal, '2026-10-10', 'Red');
    const state = { day: '2026-10-10', pass: 2, route: [first.id], index: 1, edge: false };
    assert.deepEqual(await loadProgress(journal), { state: null, bytes: null });
    const bytes = await saveProgress(journal, state, null);
    assert.deepEqual((await loadProgress(journal)).state.route, [first.id]);
    await assert.rejects(saveProgress(journal, { ...state, edge: true }, null), /changed elsewhere/);
    await saveProgress(journal, { ...state, edge: true }, bytes);
    assert.equal((await loadProgress(journal)).state.edge, true);
    assert.equal((await list(journal, '2026-10-10')).entries.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parallel writes serialize without lost thoughts; unrecognized edited headings block saving', async () => {
  const root = fixture(), directory = join(root, 'chronomancer');
  try {
    const journal = await createJournal(directory), day = '2026-10-10', path = join(directory, `${day}.md`);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store(journal, day, `Root ${i}`)));
    assert.deepEqual(new Set((await list(journal, day)).entries.map(e => e.id)), new Set(results.map(e => e.id)));
    writeFileSync(path, readFileSync(path, 'utf8') + '\n## External manual heading\n');
    await assert.rejects(store(journal, day, 'Blocked'), /Unrecognized heading/);
    assert.equal(readFileSync(path, 'utf8').includes('Blocked'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
