#!/usr/bin/env node
// Waits until production serves the commit you pushed. A deploy is not done until this passes.
//
// Usage:
//   node scripts/verify-deploy.mjs --url https://example.com/version.json --sha <commit>
//
// Options:
//   --key <path>        JSON field that holds the commit (default: sha). Dotted paths work: build.commit
//   --header <name>     Read the commit from a response header instead of the body
//   --consecutive <n>   Matches required in a row, so one lucky edge node is not enough (default: 3)
//   --timeout <sec>     Give up after this many seconds (default: 900)
//   --interval <sec>    Wait between checks (default: 15)
//   --route <url>       Extra URL that must answer 2xx once the commit matches (repeatable)
//
// Environment fallbacks: VERIFY_URL, EXPECTED_SHA (then GITHUB_SHA).
// Uses only Node built-ins (Node 20+).
import { pathToFileURL } from 'node:url';

const HEX = /^[0-9a-f]+$/;

export function shaMatches(served, expected) {
  if (!served || !expected) return false;
  const a = String(served).trim().toLowerCase();
  const b = String(expected).trim().toLowerCase();
  if (HEX.test(a) && HEX.test(b)) {
    // Short and full commits match each other, but never on fewer than 7 characters.
    if (a.length < 7 || b.length < 7) return false;
    return a.startsWith(b) || b.startsWith(a);
  }
  return a === b;
}

export function readServedSha({ body, contentType, headers }, { key = 'sha', header } = {}) {
  if (header) return headers.get(header)?.trim() || null;
  if (/json/i.test(contentType ?? '') || /^\s*[{[]/.test(body)) {
    try {
      let value = JSON.parse(body);
      for (const part of key.split('.')) value = value?.[part];
      return typeof value === 'string' ? value.trim() : null;
    } catch {
      return null;
    }
  }
  return body.trim() || null;
}

function withCacheBuster(url, attempt) {
  const busted = new URL(url);
  busted.searchParams.set('_verify', `${Date.now()}-${attempt}`);
  return busted.href;
}

export async function verifyDeploy(options, deps = {}) {
  const {
    url,
    sha,
    key = 'sha',
    header,
    consecutive = 3,
    timeoutMs = 900_000,
    intervalMs = 15_000,
    routes = [],
  } = options;
  const fetchImpl = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? console.log;
  if (!url || !sha) throw new Error('url and sha are required');

  const deadline = now() + timeoutMs;
  let streak = 0;
  let served = null;
  let attempts = 0;

  while (streak < consecutive) {
    attempts += 1;
    try {
      const res = await fetchImpl(withCacheBuster(url, attempts), { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      const body = await res.text();
      served = res.ok
        ? readServedSha({ body, contentType: res.headers.get('content-type'), headers: res.headers }, { key, header })
        : `HTTP ${res.status}`;
    } catch (error) {
      served = `error: ${error.message}`;
    }

    if (shaMatches(served, sha)) {
      streak += 1;
      log(`match ${streak}/${consecutive}: ${served}`);
      continue;
    }
    if (streak > 0) log(`streak reset, production served ${served}`);
    streak = 0;
    if (now() >= deadline) {
      return { ok: false, attempts, served, reason: `timed out: production serves ${served ?? 'nothing'}, expected ${sha}` };
    }
    await sleep(intervalMs);
  }

  for (const route of routes) {
    let status;
    try {
      status = (await fetchImpl(withCacheBuster(route, attempts), { cache: 'no-store' })).status;
    } catch (error) {
      status = error.message;
    }
    if (!(status >= 200 && status < 300)) {
      return { ok: false, attempts, served, reason: `route failed: ${route} -> ${status}` };
    }
    log(`route ok: ${route}`);
  }
  return { ok: true, attempts, served };
}

function parseArgs(argv, env) {
  const options = { routes: [] };
  const take = (i) => {
    if (argv[i + 1] === undefined) throw new Error(`missing value for ${argv[i]}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--url': options.url = take(i); i += 1; break;
      case '--sha': options.sha = take(i); i += 1; break;
      case '--key': options.key = take(i); i += 1; break;
      case '--header': options.header = take(i); i += 1; break;
      case '--consecutive': options.consecutive = Number(take(i)); i += 1; break;
      case '--timeout': options.timeoutMs = Number(take(i)) * 1000; i += 1; break;
      case '--interval': options.intervalMs = Number(take(i)) * 1000; i += 1; break;
      case '--route': options.routes.push(take(i)); i += 1; break;
      case '-h':
      case '--help': options.help = true; break;
      default: throw new Error(`unknown option: ${arg}`);
    }
  }
  options.url ??= env.VERIFY_URL;
  options.sha ??= env.EXPECTED_SHA || env.GITHUB_SHA;
  return options;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2), process.env);
    if (options.help) {
      console.log('node scripts/verify-deploy.mjs --url <version url> --sha <commit> [--key sha] [--header name] [--consecutive 3] [--timeout 900] [--interval 15] [--route <url>]');
      process.exit(0);
    }
    const result = await verifyDeploy(options);
    if (!result.ok) {
      console.error(`NOT DEPLOYED: ${result.reason}`);
      process.exit(1);
    }
    console.log(`DEPLOYED: production serves ${result.served} (${result.attempts} checks)`);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
