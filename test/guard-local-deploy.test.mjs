import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EMERGENCY_PHRASE, decide } from '../template/scripts/guard-local-deploy.mjs';

const script = fileURLToPath(new URL('../template/scripts/guard-local-deploy.mjs', import.meta.url));

function run(extraEnv) {
  const env = { ...process.env, CI: '', GITHUB_ACTIONS: '', ALLOW_LOCAL_DEPLOY: '', ...extraEnv };
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
}

test('allows CI runs', () => {
  assert.equal(decide({ CI: 'true' }).allowed, true);
  assert.equal(decide({ GITHUB_ACTIONS: 'true' }).allowed, true);
});

test('refuses a local run without the emergency phrase', () => {
  assert.equal(decide({}).allowed, false);
  assert.equal(decide({ ALLOW_LOCAL_DEPLOY: 'yes' }).allowed, false);
});

test('allows a local run only with the exact emergency phrase', () => {
  const result = decide({ ALLOW_LOCAL_DEPLOY: EMERGENCY_PHRASE });
  assert.equal(result.allowed, true);
  assert.equal(result.warn, true);
});

test('the script exits 1 locally and 0 in CI', () => {
  const local = run({});
  assert.equal(local.status, 1);
  assert.match(local.stderr, /git push/);
  assert.equal(run({ GITHUB_ACTIONS: 'true' }).status, 0);
});
