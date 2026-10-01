# KRC peer observation research checkpoint

Date: 2026-10-01. Research-only branch `research/krc-peer-observation-isolated`, forked from deployed VoiceBridge SHA `d3873bf13e60c4932ab08cae449c924051be4a37`. No production deploy, server import, configuration or limiter change.

Added `src/cloud/src/peer_observation.ts` and `src/cloud/tests/peer_observation.test.ts`. Prototype uses per-observation key generation via `randomBytes(32)` and HMAC-SHA256 96-bit tags of validated socket peer input; untrusted Forwarded header classified by shape only. It does not normalize equivalent IPv6 textual spellings (explicit limitation, unlike earlier Python prototype); do not claim TypeScript/Python parity. It is not integrated with live server and does not alter rate-limit decisions.

On authorized `krc-cobalt`, a separate checkout under `/tmp/krc_voicebridge_peer_research` used Node v24.21.0. `npm ci --ignore-scripts --no-audit --no-fund` succeeded, `npm run build` succeeded. Focused compiled Node tests `node --test dist/tests/peer_observation.test.js`: **7/7 PASS**, 0 failures. Full `npm run check` was initiated and produced initial passing tests, but a final suite summary had not yet been observed at the time of this checkpoint; do not report a full-suite PASS until confirmed.

Security gate remains conditional: no raw peer/header/key in observation output; within-key-period HMAC tags remain linkable, and actual production proxy topology is unverified. No instrumentation, logging or deployment is approved.

## Final full-suite result

The same isolated checkout's `npm run check` finished successfully: TypeScript build PASS; **277/277 Node tests PASS**, 0 failed, exit code 0, test runtime 87.52 seconds (overall process ~100.67 seconds). Focused peer observation suite separately **7/7 PASS**. This supersedes the earlier full-suite pending note. No production deployment or instrumentation was performed. TypeScript IPv6 equivalent-text normalization remains an explicit design limitation for follow-up before any live instrumentation.
