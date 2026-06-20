#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
jar_dir="${repo_root}/backend/build/libs"
fake_jar="${jar_dir}/project-os-backend-smoke-contract-test.jar"
trap 'rm -rf "${tmp_dir}"; rm -f "${fake_jar}"' EXIT

mkdir -p "${jar_dir}"
printf 'fake jar for smoke install cycle contract test\n' >"${fake_jar}"

bundle_dir="${tmp_dir}/project-os-smoke-bundle"
"${repo_root}/scripts/build-release-bundle.sh" \
  --skip-build \
  --version smoke-contract \
  --channel smoke \
  --release-notes-url https://example.invalid/project-os/smoke \
  --output-dir "${bundle_dir}" >/dev/null

bootstrap_output="$(PROJECT_OS_SERVICE_NAME=project-os-smoke-test \
  PROJECT_OS_USER=projectos-smoke-test \
  PROJECT_OS_GROUP=projectos-smoke-test \
  PROJECT_OS_SERVICE_FILE=/etc/systemd/system/project-os-smoke-test.service \
  PROJECT_OS_CLI_LINK=/usr/local/bin/project-os-smoke-test \
  "${repo_root}/scripts/bootstrap-project-os.sh" \
    --release-bundle "${bundle_dir}" \
    --dry-run \
    --runtime-dir /var/lib/project-os-smoke-test \
    --install-dir /opt/project-os-smoke-test \
    --config-dir /etc/project-os-smoke-test \
    --log-dir /var/log/project-os-smoke-test \
    --port 18083)"

grep -q 'project-os-smoke-test.service' <<<"${bootstrap_output}"
grep -q 'projectos-smoke-test' <<<"${bootstrap_output}"
grep -q '/usr/local/bin/project-os-smoke-test' <<<"${bootstrap_output}"
grep -q '/var/lib/project-os-smoke-test' <<<"${bootstrap_output}"
grep -q '/opt/project-os-smoke-test' <<<"${bootstrap_output}"

cycle_output="$("${repo_root}/scripts/smoke-install-cycle.sh" \
  --dry-run \
  --bundle-dir "${bundle_dir}" \
  --smoke-name project-os-smoke-test \
  --port 18083)"

grep -q 'Smoke mode: dry-run' <<<"${cycle_output}"
grep -q 'project-os-smoke-test.service' <<<"${cycle_output}"
grep -q 'project-os-smoke-test' <<<"${cycle_output}"
grep -q 'project-os-smoke-test support-bundle' <<<"${cycle_output}"
grep -q 'Cleanup command' <<<"${cycle_output}"
