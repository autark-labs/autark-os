#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:-autark-pro-agent:pro111}"
NAME="autark-pro-agent-client-check"
NETWORK="autark-pro-agent-client-check"
DIGEST="sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
RUNTIME_ROOT="$(mktemp -d)"
AGENT_ROOT="${RUNTIME_ROOT}/pro-agent"
SECRET_DIRECTORY="${AGENT_ROOT}/secrets"
TOKEN_FILE="${SECRET_DIRECTORY}/agent-api-token"
TOKEN="0123456789abcdefghijklmnopqrstuvwxyz_ABCD-E"

cleanup() {
    docker rm --force "${NAME}" >/dev/null 2>&1 || true
    docker network rm "${NETWORK}" >/dev/null 2>&1 || true
    rm -rf "${RUNTIME_ROOT}"
}
trap cleanup EXIT INT TERM

mkdir -p "${SECRET_DIRECTORY}"
chmod 0700 "${AGENT_ROOT}" "${SECRET_DIRECTORY}"
printf '%s' "${TOKEN}" > "${TOKEN_FILE}"
chmod 0404 "${TOKEN_FILE}"

docker network create \
    --internal \
    --driver bridge \
    "${NETWORK}" >/dev/null
docker run \
    --detach \
    --name "${NAME}" \
    --hostname autark-pro-agent \
    --label com.autarkos.pro.managed=true \
    --label com.autarkos.pro.component=autark-pro-agent \
    --label "com.autarkos.pro.digest=${DIGEST}" \
    --network "${NETWORK}" \
    --read-only \
    --user 65532:65532 \
    --cap-drop ALL \
    --security-opt no-new-privileges=true \
    --pids-limit 128 \
    --memory 512m \
    --memory-swap 512m \
    --cpus 1.0 \
    --restart no \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
    --mount "type=bind,src=${TOKEN_FILE},dst=/run/secrets/autark-pro-agent-api-token,readonly" \
    --env AUTARK_PRO_API_TOKEN_FILE=/run/secrets/autark-pro-agent-api-token \
    --env AUTARK_PRO_LISTEN=:8080 \
    "${IMAGE}" >/dev/null

attempt=0
while [[ "${attempt}" -lt 30 ]]; do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${NAME}")"
    if [[ "${health}" == "healthy" ]]; then
        break
    fi
    if [[ "$(docker inspect --format '{{.State.Running}}' "${NAME}")" != "true" ]]; then
        docker logs "${NAME}"
        exit 1
    fi
    attempt=$((attempt + 1))
    sleep 1
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' "${NAME}")" == "healthy" ]]

ENDPOINT="$(docker inspect --format "{{with index .NetworkSettings.Networks \"${NETWORK}\"}}{{.IPAddress}}{{end}}" "${NAME}")"
[[ "${ENDPOINT}" =~ ^(10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[01]\.|192\.168\.) ]]

AUTARK_PRO_LIVE_ENDPOINT="${ENDPOINT}" \
AUTARK_PRO_LIVE_DIGEST="${DIGEST}" \
AUTARK_PRO_LIVE_RUNTIME_ROOT="${RUNTIME_ROOT}" \
    "${ROOT}/backend/gradlew" \
        -p "${ROOT}/backend" \
        test \
        --rerun-tasks \
        --tests com.autarkos.pro.agent.ProAgentLiveContractTests

printf '%s\n' "Public core client validated the real private agent."
