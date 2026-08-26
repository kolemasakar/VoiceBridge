# A9.9 Telegram Managed Code Acceptance

Status: CODE_AND_CLOUD_TESTS_ACCEPTED
Date: 2026-08-26
Branch: `agent/krc-media-transcript`

## Scope

This record covers the first isolated managed implementation for public Telegram video posts. It does not authorize Render deployment, Builder changes, production VoiceBridge changes, public KRC changes, or external rollout.

## Implemented path

```text
public https://t.me/<channel>/<post_id>
 -> URL normalization and public-only validation
 -> Telegram embed GET with embed=1&single=1
 -> exact data-post and video-player selection
 -> trusted Telegram CDN HTTPS MP4
 -> AssemblyAI STT
 -> durable KRCM job and segments
```

Accepted URL aliases include `telegram.me` and `t.me/s`; they normalize to the canonical `t.me/<channel>/<post_id>` form.

## Security and cost boundary

- no Telegram login, cookies, MTProto user session, bot token, or imported session state;
- invite/login/non-post links are rejected;
- direct media must use a trusted Telegram CDN HTTPS host;
- arbitrary message links are not fetched;
- public preview timeout and size limits are enforced;
- retrieval credits are fixed at `0`;
- there is no paid Telegram fallback;
- unavailable public media becomes a terminal durable failure and duplicate starts reuse that result instead of replaying retrieval.

## Durable managed integration

Accepted feature commit:

`4c985b10c946d6f89d1045cd01fabb7048db8931` - `A9.9: integrate Telegram durable managed path`

The managed capability now advertises Telegram and the new HTTP route is:

`POST /api/v1/media/managed/telegram`

Common managed job status and segment read routes are reused after start.

Telegram job markers:
- `provider=assemblyai`;
- `provider_mode=telegram_public_retrieval_stt`;
- `retrieval_provider=telegram_public_web`;
- `retrieval_credits_charged=0`;
- `stt_seconds_charged` records reserved AssemblyAI duration;
- durable duplicate starts reuse the existing terminal/completed record.

## Automated evidence

A9.9 integration workflow run `32967190414` completed successfully after the stale capability regression was updated.

The cloud check executed TypeScript build plus the full Node test suite. Telegram-specific passing coverage includes:
- URL normalization/rejection;
- exact embed/media extraction;
- trusted Telegram CDN filtering;
- zero retrieval credits;
- terminal unavailable behavior;
- durable completion and segment readback;
- duplicate no-retry behavior;
- managed HTTP start/get/segments path.

No external Telegram, Render, AssemblyAI or other provider call was made by this code-acceptance workflow.

## Next gate

Run normal branch CI from a user-authored checkpoint commit, then prepare isolated runtime deployment and live Telegram acceptance. Builder/OpenAPI promotion remains after live backend acceptance, not before it.
