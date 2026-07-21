#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTHY_IMAGE="${1:-autark-pro-agent:pro111}"
HEALTHY_VERSION="${2:-0.1.0}"
REGISTRY_NAME="autark-pro-agent-cutover-registry"
RUNTIME_ROOT="$(mktemp -d)"
REPOSITORY=""
HEALTHY_REFERENCE=""
BROKEN_REFERENCE=""

cleanup() {
    docker rm --force \
        autark-pro-agent \
        autark-pro-agent-rollback \
        "${REGISTRY_NAME}" >/dev/null 2>&1 || true
    while IFS= read -r candidate; do
        [[ -n "${candidate}" ]] &&
            docker rm --force "${candidate}" >/dev/null 2>&1 || true
    done < <(docker ps --all \
        --filter name=autark-pro-agent-candidate- \
        --format '{{.Names}}')
    docker network rm \
        autark-pro-agent-internal >/dev/null 2>&1 || true
    [[ -n "${HEALTHY_REFERENCE}" ]] &&
        docker image rm "${HEALTHY_REFERENCE}" >/dev/null 2>&1 || true
    [[ -n "${BROKEN_REFERENCE}" ]] &&
        docker image rm "${BROKEN_REFERENCE}" >/dev/null 2>&1 || true
    rm -rf "${RUNTIME_ROOT}"
}
trap cleanup EXIT INT TERM

docker run \
    --detach \
    --name "${REGISTRY_NAME}" \
    --publish 127.0.0.1::5000 \
    registry:3 >/dev/null
REGISTRY_PORT="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "${REGISTRY_NAME}")"
REPOSITORY="127.0.0.1:${REGISTRY_PORT}/autark-pro-agent"
HEALTHY_REFERENCE="${REPOSITORY}:healthy"
BROKEN_REFERENCE="${REPOSITORY}:broken"

docker tag "${HEALTHY_IMAGE}" "${HEALTHY_REFERENCE}"
docker push "${HEALTHY_REFERENCE}" >/dev/null
docker image inspect hello-world:latest >/dev/null 2>&1 ||
    docker pull hello-world:latest >/dev/null
docker tag hello-world:latest "${BROKEN_REFERENCE}"
docker push "${BROKEN_REFERENCE}" >/dev/null

HEALTHY_DIGEST="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${HEALTHY_REFERENCE}" |
    while IFS= read -r reference; do
        if [[ "${reference}" == "${REPOSITORY}@"* ]]; then
            printf '%s\n' "${reference#*@}"
            break
        fi
    done)"
BROKEN_DIGEST="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${BROKEN_REFERENCE}" |
    while IFS= read -r reference; do
        if [[ "${reference}" == "${REPOSITORY}@"* ]]; then
            printf '%s\n' "${reference#*@}"
            break
        fi
    done)"
[[ "${HEALTHY_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "${BROKEN_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "${HEALTHY_DIGEST}" != "${BROKEN_DIGEST}" ]]

AUTARK_PRO_LIVE_HEALTHY_REPOSITORY="${REPOSITORY}" \
AUTARK_PRO_LIVE_HEALTHY_DIGEST="${HEALTHY_DIGEST}" \
AUTARK_PRO_LIVE_HEALTHY_VERSION="${HEALTHY_VERSION}" \
AUTARK_PRO_LIVE_BROKEN_REPOSITORY="${REPOSITORY}" \
AUTARK_PRO_LIVE_BROKEN_DIGEST="${BROKEN_DIGEST}" \
AUTARK_PRO_LIVE_RUNTIME_ROOT="${RUNTIME_ROOT}" \
    "${ROOT}/backend/gradlew" \
        -p "${ROOT}/backend" \
        test \
        --rerun-tasks \
        --tests com.autarkos.pro.runtime.ProAgentLiveCutoverTests

printf '%s\n' "Healthy cutover and broken-candidate rollback passed."
