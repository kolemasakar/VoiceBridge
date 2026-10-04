# Bounded Facebook URL rollout candidate — 2026-10-04

Baseline production: d3873bf13e60c4932ab08cae449c924051be4a37.
Release contains ONLY managed_media_url.ts repair, 3 regression tests and this checkpoint. Research peer diagnostics and managed wrapper injection are excluded.

Trigger: a public Facebook /videos/<title>/<numeric-ID>/ URL lost its numeric ID, causing the wrong source/job identity. New behavior canonicalizes it to /videos/<numeric-ID>/ and rejects ambiguous extra components. Distinct IDs remain distinct. Direct one-token video links retain prior behavior.

Exact baseline worktree plus these two files: npm run check PASS, TypeScript build and 273/273 full tests, 0 failures,95.06s. Research source separately passed 28/28 Facebook tests and9/9 local crossrepo tests.

Owner instructed continuation after the reviewed tested repair and confirmed Render workspace. Bounded existing free-service rollout and fresh acceptance are within that continuation. No main merge, paid provider, secret or infrastructure changes. Verify Render deploy SHA equals this release commit; preserve all existing configuration. No repeated start of a failed/uncertain job without owner instruction; the owner's current continuation is fresh instruction to progress acceptance after fixes.
