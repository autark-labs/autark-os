#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/autark-os-backend-smoke-contract-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

python3 "${repo_root}/scripts/tests/create-release-test-jar.py" \
  --output "${fake_jar}" \
  --version smoke-contract \
  --build-sha smoke-contract-sha

bundle_dir="${tmp_dir}/autark-os-smoke-bundle"
AUTARK_OS_BACKEND_JAR="${fake_jar}" AUTARK_OS_BUILD_SHA=smoke-contract-sha "${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version smoke-contract \
  --channel smoke \
  --release-notes-url https://example.invalid/autark-os/smoke \
  --output-dir "${bundle_dir}" >/dev/null

bootstrap_output="$(AUTARK_OS_SERVICE_NAME=autark-os-smoke-test \
  AUTARK_OS_USER=autarkos-smoke-test \
  AUTARK_OS_GROUP=autarkos-smoke-test \
  AUTARK_OS_SERVICE_FILE=/etc/systemd/system/autark-os-smoke-test.service \
  AUTARK_OS_CLI_LINK=/usr/local/bin/autark-os-smoke-test \
  "${repo_root}/scripts/bootstrap-autark-os.sh" \
    --release-bundle "${bundle_dir}" \
    --dry-run \
    --runtime-dir /var/lib/autark-os-smoke-test \
    --install-dir /opt/autark-os-smoke-test \
    --config-dir /etc/autark-os-smoke-test \
    --log-dir /var/log/autark-os-smoke-test \
    --port 18083)"

grep -q 'autark-os-smoke-test.service' <<<"${bootstrap_output}"
grep -q 'autarkos-smoke-test' <<<"${bootstrap_output}"
grep -q '/usr/local/bin/autark-os-smoke-test' <<<"${bootstrap_output}"
grep -q '/var/lib/autark-os-smoke-test' <<<"${bootstrap_output}"
grep -q '/opt/autark-os-smoke-test' <<<"${bootstrap_output}"

cycle_output="$("${repo_root}/scripts/smoke-install-cycle.sh" \
  --dry-run \
  --bundle-dir "${bundle_dir}" \
  --smoke-name autark-os-smoke-test \
  --port 18083)"

grep -q 'Smoke mode: dry-run' <<<"${cycle_output}"
grep -q 'autark-os-smoke-test.service' <<<"${cycle_output}"
grep -q 'autark-os-smoke-test' <<<"${cycle_output}"
grep -q 'autark-os-smoke-test support-bundle' <<<"${cycle_output}"
grep -q 'Cleanup command' <<<"${cycle_output}"
