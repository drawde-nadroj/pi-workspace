import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const install = join(homedir(), ".pi/agent/install");
const hostModules = process.env.PI_HOME_HOST_MODULES || join(install, "releases", readFileSync(join(install, "current-version"), "utf8").trim(), "node_modules");
const loader = join(hostModules, "@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");

function command(file, args, options = {}) {
  return execFileSync(file, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, ...options });
}

test("packed private suite loads its only three entry points in an isolated Pi directory", { timeout: 120_000 }, async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "pi-suite-test-"));
  const agent = join(sandbox, "agent"), project = join(sandbox, "project"), runtime = join(sandbox, "runtime");
  const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
  mkdirSync(agent); mkdirSync(project); mkdirSync(runtime);
  try {
    const report = JSON.parse(command("npm", ["pack", "--json", "--pack-destination", sandbox], { cwd: checkout, env }));
    const packed = Array.isArray(report) ? report[0] : Object.values(report)[0];
    const paths = packed.files.map(file => file.path);
    assert.deepEqual(packed.bundled, ["pi-embeddable-frame"]);
    assert.ok(paths.includes("node_modules/pi-embeddable-frame/primitives.js"));
    assert.ok(paths.includes("packages/pi-ask/extensions/questions.ts"));
    assert.ok(!paths.some(path => path.includes("/tests/") || path.includes("/test/") || path.includes("auth.json")));
    assert.ok(!paths.some(path => path.startsWith("node_modules/@earendil-works/")), "host packages must not be bundled");

    const archive = join(sandbox, packed.filename);
    command("npm", ["install", "--prefix", runtime, archive, "--offline", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: project, env });
    const suite = join(runtime, "node_modules/pi-workspace-suite");
    const manifest = JSON.parse(readFileSync(join(suite, "package.json"), "utf8"));
    assert.deepEqual(manifest.pi.extensions, [
      "./extensions/pi-home/index.ts", "./extensions/pi-tasks/index.ts", "./packages/pi-ask/extensions/questions.ts",
    ]);
    assert.ok(readFileSync(join(suite, "node_modules/pi-embeddable-frame/primitives.js"), "utf8"));
    command("pi", ["install", suite], { cwd: project, env });
    const settings = JSON.parse(readFileSync(join(agent, "settings.json"), "utf8"));
    assert.equal(settings.packages.length, 1, "only one Pi package is declared");
    assert.match(command("pi", ["list"], { cwd: project, env }), /pi-workspace-suite/);
    command("pi", ["--offline", "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes", "--help"], { cwd: project, env });
    const rpc = command("pi", ["--mode", "rpc", "--no-session", "--offline", "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-themes"], {
      cwd: project, env, input: '{"id":"suite-commands","type":"get_commands"}\n',
    }).trim().split("\n").map(line => JSON.parse(line));
    const response = rpc.find(record => record.id === "suite-commands");
    assert.equal(response?.success, true, "the real Pi process loads the packed suite");
    const packageCommands = response.data.commands.filter(entry => entry.source === "extension" && entry.sourceInfo?.origin === "package");
    assert.deepEqual(packageCommands.map(entry => entry.name).sort(), ["composer-preview", "home", "recaps", "tasks", "workspace"]);
    assert.ok(packageCommands.every(entry => entry.sourceInfo.baseDir === suite), "commands come from one packed suite");

    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agent;
    try {
      const { loadExtensions } = await import(pathToFileURL(loader));
      const entries = manifest.pi.extensions.map(path => join(suite, path));
      for (let load = 0; load < 2; load++) {
        const result = await loadExtensions(entries, project);
        assert.deepEqual(result.errors, [], `load ${load + 1}: ${JSON.stringify(result.errors)}`);
        assert.equal(result.extensions.length, 3);
        const tools = result.extensions.flatMap(extension => [...extension.tools.keys()]);
        const commands = result.extensions.flatMap(extension => [...extension.commands.keys()]);
        assert.equal(tools.length, new Set(tools).size, "one owner per tool name");
        assert.equal(commands.length, new Set(commands).size, "one owner per command name");
        for (const name of ["tasks", "ask_user_question", "ask_questions"]) assert.ok(tools.includes(name), name);
        for (const name of ["home", "workspace", "tasks"]) assert.ok(commands.includes(name), name);
      }
      const tasksOnly = await loadExtensions([entries[1]], project);
      assert.deepEqual(tasksOnly.errors, [], "Tasks cold-loads without Home or Ask");
      assert.ok(tasksOnly.extensions[0].tools.has("tasks"));
    } finally {
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
    }
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
