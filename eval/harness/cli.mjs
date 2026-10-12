import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenarios, fixtureFiles } from './scenarios.mjs';
import { template, compareReports } from './report.mjs';

export async function main(args) {
  const [command, a, b, ...extra] = args;
  if (extra.length) throw new Error('Unexpected arguments.');
  if (command === 'list' && !a) return scenarios;
  if (command === 'prepare' && a && b) {
    const scenario = scenarios.find(s => s.id === a);
    if (!scenario) throw new Error('Unknown scenario. Use list.');
    const directory = resolve(b);
    // Never overwrite a checkout or reuse a prior run. Parent must already exist.
    await mkdir(directory);
    for (const [name, content] of Object.entries(fixtureFiles)) await writeFile(join(directory, name), content, { flag: 'wx' });
    return { directory, scenario, note: 'Fixture only. No Pi process or model request was started. Keep the operator script outside model context.' };
  }
  if (command === 'template' && a && b) {
    const report = template(a);
    await writeFile(resolve(b), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { path: resolve(b), note: 'Unmeasured fields remain null; metadata and review are required before comparison.' };
  }
  if (command === 'compare' && a && b) {
    return compareReports(JSON.parse(await readFile(a, 'utf8')), JSON.parse(await readFile(b, 'utf8')));
  }
  throw new Error('Usage: node eval/harness/cli.mjs list | prepare <scenario-id> <new-directory> | template <baseline|candidate> <new-json-file> | compare <baseline.json> <candidate.json>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
