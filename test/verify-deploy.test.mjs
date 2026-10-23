import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readServedSha, shaMatches, verifyDeploy } from '../template/scripts/verify-deploy.mjs';

const OLD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const NEW = 'f00dbabe1234567890abcdef1234567890abcdef';

// Serves the commits in `sequence` one request at a time, then repeats the last one.
async function versionServer(sequence, { routeStatus = 200 } = {}) {
  let hits = 0;
  const server = createServer((req, res) => {
    if (req.url.startsWith('/route')) {
      res.writeHead(routeStatus);
      res.end();
      return;
    }
    const sha = sequence[Math.min(hits, sequence.length - 1)];
    hits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sha }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

const quiet = { log: () => {} };

test('shaMatches accepts a full or short commit and rejects others', () => {
  assert.equal(shaMatches(NEW, NEW), true);
  assert.equal(shaMatches(NEW.slice(0, 7), NEW), true);
  assert.equal(shaMatches(NEW, NEW.slice(0, 7).toUpperCase()), true);
  assert.equal(shaMatches(OLD, NEW), false);
  assert.equal(shaMatches(NEW.slice(0, 6), NEW), false);
  assert.equal(shaMatches('release-42', 'release-42'), true);
  assert.equal(shaMatches(null, NEW), false);
});

test('readServedSha reads JSON keys, dotted keys, plain text and headers', () => {
  const headers = new Headers({ 'x-commit': NEW });
  assert.equal(readServedSha({ body: JSON.stringify({ sha: NEW }), contentType: 'application/json', headers }), NEW);
  assert.equal(
    readServedSha({ body: JSON.stringify({ build: { commit: NEW } }), contentType: 'application/json', headers }, { key: 'build.commit' }),
    NEW,
  );
  assert.equal(readServedSha({ body: `${NEW}\n`, contentType: 'text/plain', headers }), NEW);
  assert.equal(readServedSha({ body: '', contentType: 'text/plain', headers }, { header: 'x-commit' }), NEW);
  assert.equal(readServedSha({ body: '{broken', contentType: 'application/json', headers }), null);
});

test('waits until production serves the pushed commit several times in a row', async () => {
  const server = await versionServer([OLD, OLD, NEW]);
  try {
    const result = await verifyDeploy({ url: `${server.base}/version.json`, sha: NEW, consecutive: 3, intervalMs: 0 }, quiet);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 5);
  } finally {
    await server.close();
  }
});

test('a stale response in the middle resets the streak', async () => {
  const server = await versionServer([NEW, OLD, NEW, NEW, NEW]);
  try {
    const result = await verifyDeploy({ url: `${server.base}/version.json`, sha: NEW, consecutive: 3, intervalMs: 0 }, quiet);
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 5);
  } finally {
    await server.close();
  }
});

test('fails with the served commit when production never catches up', async () => {
  const server = await versionServer([OLD]);
  try {
    const result = await verifyDeploy({ url: `${server.base}/version.json`, sha: NEW, timeoutMs: 60, intervalMs: 10 }, quiet);
    assert.equal(result.ok, false);
    assert.match(result.reason, new RegExp(OLD));
  } finally {
    await server.close();
  }
});

test('fails when a critical route does not answer 2xx', async () => {
  const server = await versionServer([NEW], { routeStatus: 500 });
  try {
    const result = await verifyDeploy(
      { url: `${server.base}/version.json`, sha: NEW, consecutive: 1, intervalMs: 0, routes: [`${server.base}/route`] },
      quiet,
    );
    assert.equal(result.ok, false);
    assert.match(result.reason, /500/);
  } finally {
    await server.close();
  }
});

test('the command line exits 0 when deployed and 1 when stale', async () => {
  const script = fileURLToPath(new URL('../template/scripts/verify-deploy.mjs', import.meta.url));
  const server = await versionServer([NEW]);
  const run = (args) =>
    new Promise((resolve) => {
      execFile(process.execPath, [script, ...args], (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
    });
  try {
    const ok = await run(['--url', `${server.base}/version.json`, '--sha', NEW.slice(0, 7), '--interval', '0']);
    assert.equal(ok.code, 0);
    assert.match(ok.stdout, /DEPLOYED/);
    const stale = await run(['--url', `${server.base}/version.json`, '--sha', OLD, '--interval', '0', '--timeout', '0']);
    assert.equal(stale.code, 1);
    assert.match(stale.stderr, /NOT DEPLOYED/);
    const bad = await run(['--nope']);
    assert.equal(bad.code, 2);
  } finally {
    await server.close();
  }
});

test('requires a url and a commit', async () => {
  await assert.rejects(verifyDeploy({ url: '', sha: NEW }, quiet), /url and sha/);
});
