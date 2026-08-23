#!/usr/bin/env bash
set -euo pipefail

phase=init
trap 'rc=$?; echo "A9.7-G1_FAIL_PHASE=${phase} rc=${rc}" >&2; exit "$rc"' ERR

: "${RENDER_API_KEY:?RENDER_API_KEY required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"

RENDER_API_BASE=https://api.render.com/v1
OWNER_SOURCE_SERVICE_ID=srv-da1kic5bedkc73d6fk60
SERVICE_NAME=krc-cobalt-media-beta-kolemasakar
SERVICE_URL=https://krc-cobalt-media-beta-kolemasakar.onrender.com
IMAGE_URL=ghcr.io/imputnet/cobalt@sha256:63186dd68afd57ce3bb1f62cc4c139f5fa95b9c3e87a3cf5c6e4c7a570523f62

echo "::add-mask::$RENDER_API_KEY"
api=(-H 'Accept: application/json' -H "Authorization: Bearer ${RENDER_API_KEY}")

phase=owner_source
curl -fsS "${RENDER_API_BASE}/services/${OWNER_SOURCE_SERVICE_ID}" "${api[@]}" > /tmp/owner-source.json
owner_id="$(jq -r '.ownerId // empty' /tmp/owner-source.json)"
test -n "$owner_id"
echo 'A9.7-G1 owner source resolved.'

lookup() {
  curl -fsS "${RENDER_API_BASE}/services?limit=100" "${api[@]}"
}

phase=service_lookup
lookup > /tmp/by-name.json
count="$(jq --arg name "$SERVICE_NAME" '[.[] | (.service // .) | select(.name == $name)] | length' /tmp/by-name.json)"
echo "A9.7-G1 target service count=${count}"
[[ "$count" -le 1 ]]
created=false

if [[ "$count" -eq 0 ]]; then
  phase=credential_prepare
  key="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
  echo "::add-mask::$key"
  jq -n --arg k "$key" '{($k): {name:"voicebridge-krc-media-beta", limit:20, allowedServices:["facebook"]}}' > /tmp/cobalt-keys.json
  chmod 600 /tmp/cobalt-keys.json

  phase=cli_install
  curl -fsSL https://raw.githubusercontent.com/render-oss/cli/main/bin/install.sh | sh >/tmp/render-install.log 2>&1
  phase=workspace_set
  render workspace set "$owner_id" -o text >/tmp/workspace-set.log 2>&1
  phase=service_create
  render services create \
    --name "$SERVICE_NAME" \
    --type web_service \
    --image "$IMAGE_URL" \
    --plan free \
    --region frankfurt \
    --health-check-path / \
    --env-var "API_URL=${SERVICE_URL}/" \
    --env-var 'API_PORT=10000' \
    --env-var 'API_LISTEN_ADDRESS=0.0.0.0' \
    --env-var 'API_KEY_URL=file:///etc/secrets/cobalt-keys.json' \
    --env-var 'API_AUTH_REQUIRED=1' \
    --env-var 'CORS_WILDCARD=0' \
    --env-var 'CORS_URL=https://voicebridge-krc-media-beta-kolemasakar.onrender.com' \
    --env-var 'DURATION_LIMIT=3600' \
    --env-var 'RATELIMIT_WINDOW=60' \
    --env-var 'RATELIMIT_MAX=20' \
    --secret-file "cobalt-keys.json:/tmp/cobalt-keys.json" \
    --confirm -o json >/tmp/create.json
  created=true
  shred -u /tmp/cobalt-keys.json 2>/dev/null || rm -f /tmp/cobalt-keys.json
fi

phase=resolve_service
service_id=''
for _ in $(seq 1 60); do
  lookup > /tmp/by-name-after.json
  service_id="$(jq -r --arg name "$SERVICE_NAME" '[.[] | (.service // .) | select(.name == $name)][0].id // empty' /tmp/by-name-after.json)"
  [[ -n "$service_id" ]] && break
  sleep 2
done
test -n "$service_id"

phase=validate_service
curl -fsS "${RENDER_API_BASE}/services/${service_id}" "${api[@]}" >/tmp/service.json
name="$(jq -r '.name // empty' /tmp/service.json)"
type="$(jq -r '.type // empty' /tmp/service.json)"
plan="$(jq -r '.serviceDetails.plan // .plan // empty' /tmp/service.json)"
region="$(jq -r '.serviceDetails.region // .region // empty' /tmp/service.json)"
runtime="$(jq -r '.serviceDetails.env // .env // .runtime // empty' /tmp/service.json)"
image_seen="$(jq -r '.imagePath // .image.path // .image.url // .serviceDetails.imagePath // .serviceDetails.imageUrl // empty' /tmp/service.json)"
[[ "$name" == "$SERVICE_NAME" ]]
[[ "$type" == web_service ]]
[[ "$plan" == free ]]
[[ "$region" == frankfurt ]]
if [[ -n "$image_seen" && "$image_seen" != "$IMAGE_URL" ]]; then
  echo 'Unexpected image path.' >&2
  exit 1
fi

phase=wait_deploy
deploy_status=unknown
deploy_id=none
for _ in $(seq 1 120); do
  curl -fsS "${RENDER_API_BASE}/services/${service_id}/deploys?limit=20" "${api[@]}" >/tmp/deploys.json
  row="$(jq -c '[.[] | (.deploy // .)][0] // empty' /tmp/deploys.json)"
  if [[ -n "$row" ]]; then
    deploy_status="$(jq -r '.status // "unknown"' <<<"$row")"
    deploy_id="$(jq -r '.id // "none"' <<<"$row")"
    case "$deploy_status" in
      live|build_failed|update_failed|canceled|deactivated) break ;;
    esac
  fi
  sleep 5
done
[[ "$deploy_status" == live ]]

phase=health
health_http=000
for _ in $(seq 1 30); do
  health_http="$(curl -sS --max-time 30 -o /tmp/health.json -w '%{http_code}' "${SERVICE_URL}/" || true)"
  [[ "$health_http" == 200 ]] && break
  sleep 4
done
[[ "$health_http" == 200 ]]

phase=unauth_gate
unauth_http="$(curl -sS --max-time 30 -o /tmp/unauth.json -w '%{http_code}' \
  -X POST "${SERVICE_URL}/" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://cobalt-auth-gate.invalid/"}' || true)"
unauth_code="$(jq -r '.error.code // .error // empty' /tmp/unauth.json 2>/dev/null || true)"
[[ "$unauth_http" == 401 ]]
[[ "$unauth_code" == *auth* ]]

phase=outputs
{
  echo "created=$created"
  echo "service_id=$service_id"
  echo "service_name=$name"
  echo "service_type=$type"
  echo "plan=$plan"
  echo "region=$region"
  echo "runtime=$runtime"
  echo "deploy_id=$deploy_id"
  echo "deploy_status=$deploy_status"
  echo "health_http=$health_http"
  echo "unauth_http=$unauth_http"
  echo "unauth_code=$unauth_code"
} >> "$GITHUB_OUTPUT"

phase=done
