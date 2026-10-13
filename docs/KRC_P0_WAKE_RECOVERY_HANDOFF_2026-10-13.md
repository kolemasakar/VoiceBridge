# VoiceBridge — P0 recovery integration checkpoint (2026-10-13)

KRC recovery client and owner-controlled relay were implemented, tested, staged and deployed only where safe. Full technical evidence and gates in KRC: [P0 implementation checkpoint](https://github.com/kolemasakar/K_Research_Critic/blob/agent/krc-public-media-r3-integration/docs/media/KRC_P0_WAKE_RECOVERY_IMPLEMENTATION_2026-10-13.md).

Summary:
- Exact KRC code HEAD 541e1a89... local tests 493 PASS / 17 normal opt-in SKIP, plus 17/17 opt-in PASS; client feature disabled by default.
- KRC R3C Render deploy dep-db6ujp3ncjis73etq130 LIVE; no VoiceBridge production code/deploy changes. No provider work.
- Owner krc-cobalt local relay user-service is ACTIVE on loopback 127.0.0.1:9012 with a secret stored in a mode-0600 owner file. Public Caddy route was validated as a PROPOSAL, not applied; Render client not enabled.
- Authorized authenticated local E2E test blocked by platform safety; do not bypass.
- Support email to Render SENT with two CF-Ray IDs, no Render ticket number confirmed, response pending.
- P0 NOT COMPLETED; cannot claim cold automatic wake works until external path, secret provisioning, and three cold runs prove it. FREE_ONLY/no keepalive stays active.

## Render support correspondence update — 2026-10-13
- Initial support email SENT to support@render.com, Gmail thread 1a1345c51acb026f. Received a reply from Render's **AI Agent**, explaining standard Free 15-minute spin-down, Cloudflare transit and Rndr-Id tracing. The reply did NOT trace either failing CF-Ray nor establish the emitting layer of HTTP 429; attribution remains OPEN.
- An escalation requesting a HUMAN Render support engineer and direct tracing of CF-Ray a49ccaf70d1d18cb-FRA / a49ccaf77d4d0d18-FRA was sent as a reply in the same thread (Gmail SENT id 1a13460d51754ced). Awaiting human analysis.
- No Render support ticket number provided; do not claim one.

## krc-cobalt staging detail
- Enabled user systemd unit krc-p0-wake-relay.service with linger=yes; listener 127.0.0.1:9012 only, ActiveState=active, SubState=running; key/server/unit files have 0600 permissions. The relay emits no scheduled health/keepalive requests.
- User systemd sandbox PrivateDevices/ProtectSystem options caused 218/CAPABILITIES, were removed; active service retains NoNewPrivileges, PrivateTmp, RestrictAddressFamilies, UMask, MemoryMax=64M and TasksMax=16. Initial restart counter included failed configuration attempts, not evidence of ongoing failures.
- Proposed Caddy routing file /home/krcops/krc-p0-wake/Caddyfile.proposed successfully validated with caddy validate; **NOT INSTALLED**. Existing /etc/caddy/Caddyfile still forwards entire domain to Cobalt port 9000. A privileged authorized Caddy change is required; avoid editing config as unprivileged krcops or bypassing access controls.
- An attempted local secret-bearing live-test call was blocked by a safety guard; it was NOT retried. Do not mark relay authenticated E2E as verified. All offline unit/integration tests remain PASS; live gate pending.
