#!/usr/bin/env node
// Put this in front of your production deploy command:
//   "deploy": "node scripts/guard-local-deploy.mjs && <your real deploy command>"
//
// In CI it does nothing. On a laptop, or inside an AI agent's shell, it refuses,
// unless a person sets the emergency phrase on purpose. The real lock is that the
// production deploy token lives only in CI secrets; this script makes the rule visible.
import { pathToFileURL } from 'node:url';

export const EMERGENCY_PHRASE = 'I_UNDERSTAND_THIS_BYPASSES_CI';

export function decide(env) {
  if (env.CI === 'true' || env.GITHUB_ACTIONS === 'true') {
    return { allowed: true, reason: 'running in CI' };
  }
  if (env.ALLOW_LOCAL_DEPLOY === EMERGENCY_PHRASE) {
    return { allowed: true, warn: true, reason: 'emergency local deploy' };
  }
  return { allowed: false, reason: 'local production deploys are blocked' };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const result = decide(process.env);
  if (!result.allowed) {
    console.error(
      [
        'Production deploys run only from CI. Use `git push` and let CI test, deploy and verify.',
        `Emergency only: ALLOW_LOCAL_DEPLOY=${EMERGENCY_PHRASE} npm run deploy`,
        'Then run scripts/verify-deploy.mjs and record why in docs/continuity/STATUS.md.',
      ].join('\n'),
    );
    process.exit(1);
  }
  if (result.warn) {
    console.warn('WARNING: emergency local deploy. Verify production with scripts/verify-deploy.mjs afterwards.');
  }
}
