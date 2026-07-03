#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar for unified autark-os install command test\n' >"${fake_jar}"

output="$("${repo_root}/scripts/autark-os" install \
  --plan \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/runtime" \
  --install-dir "${tmp_dir}/install" \
  --config-dir "${tmp_dir}/config" \
  --log-dir "${tmp_dir}/logs" \
  --port 9197)"

guided_json_output="$("${repo_root}/scripts/autark-os" install \
  --guided \
  --plan \
  --json \
  --release-jar "${fake_jar}" \
  --runtime-dir "${tmp_dir}/guided-runtime" \
  --install-dir "${tmp_dir}/guided-install" \
  --config-dir "${tmp_dir}/guided-config" \
  --log-dir "${tmp_dir}/guided-logs" \
  --port 9199)"

AUTARK_OS_INSTALL_JSON="${output}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_INSTALL_JSON"])
assert plan["schemaVersion"] == 1
assert plan["service"]["port"] == 9197
assert plan["paths"]["runtimeDir"].endswith("/runtime")
assert any(warning["id"] == "confirm-host-mutation" for warning in plan["warnings"])
PY

AUTARK_OS_GUIDED_INSTALL_JSON="${guided_json_output}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_GUIDED_INSTALL_JSON"])
assert plan["schemaVersion"] == 1
assert plan["service"]["port"] == 9199
PY

help_output="$("${repo_root}/scripts/autark-os" --help)"
grep -q 'install    Install Autark-OS or print a shared install plan.' <<<"${help_output}"
grep -q 'repair     Check installed Autark-OS and print recovery actions.' <<<"${help_output}"
grep -q 'update     Check or run Autark-OS update flow.' <<<"${help_output}"
grep -q 'uninstall  Remove Autark-OS service paths through the guided uninstall flow.' <<<"${help_output}"

install_help="$("${repo_root}/scripts/autark-os" install --help)"
grep -q 'autark-os install --guided' <<<"${install_help}"
grep -q 'autark-os install --plan --json' <<<"${install_help}"
grep -q 'Routes to bootstrap-autark-os.sh' <<<"${install_help}"

"${repo_root}/scripts/autark-os" repair --help >/dev/null
"${repo_root}/scripts/autark-os" update --help >/dev/null
"${repo_root}/scripts/autark-os" uninstall --help >/dev/null

bundle_dir="${tmp_dir}/bundle"
mkdir -p "${bundle_dir}/scripts" "${bundle_dir}/backend"
cp "${repo_root}/scripts/autark-os" "${bundle_dir}/scripts/autark-os"
cp "${repo_root}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/bootstrap-autark-os.sh"
cp "${repo_root}/scripts/install-autark-os-service.sh" "${bundle_dir}/scripts/install-autark-os-service.sh"
cp "${fake_jar}" "${bundle_dir}/backend/autark-os-backend.jar"
printf '{"schemaVersion":1}\n' >"${bundle_dir}/autark-os-release.json"
chmod +x "${bundle_dir}/scripts/autark-os" "${bundle_dir}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/install-autark-os-service.sh"

bundle_output="$("${bundle_dir}/scripts/autark-os" install \
  --plan \
  --json \
  --runtime-dir "${tmp_dir}/bundle-runtime" \
  --install-dir "${tmp_dir}/bundle-install" \
  --config-dir "${tmp_dir}/bundle-config" \
  --log-dir "${tmp_dir}/bundle-logs" \
  --port 9198)"

AUTARK_OS_BUNDLE_INSTALL_JSON="${bundle_output}" BUNDLE_DIR="${bundle_dir}" python3 - <<'PY'
import json
import os

plan = json.loads(os.environ["AUTARK_OS_BUNDLE_INSTALL_JSON"])
assert plan["schemaVersion"] == 1
assert plan["service"]["port"] == 9198
assert plan["artifact"]["releaseBundle"] == os.environ["BUNDLE_DIR"]
assert plan["artifact"]["backendJar"].endswith("/backend/autark-os-backend.jar")
PY

printf 'autark-os-release.env\n' >"${bundle_dir}/SHA256SUMS"
(cd "${bundle_dir}" && sha256sum backend/autark-os-backend.jar scripts/autark-os scripts/bootstrap-autark-os.sh autark-os-release.json > SHA256SUMS)

single_command_output="$("${bundle_dir}/scripts/autark-os" install \
  --dry-run \
  --runtime-dir "${tmp_dir}/single-runtime" \
  --install-dir "${tmp_dir}/single-install" \
  --config-dir "${tmp_dir}/single-config" \
  --log-dir "${tmp_dir}/single-logs" \
  --port 9200)"

grep -q 'Unified guided install' <<<"${single_command_output}"
grep -q 'Verifying release bundle checksums' <<<"${single_command_output}"
grep -q 'Installing missing supported dependencies by default' <<<"${single_command_output}"
grep -q 'Autark-OS installation preview completed.' <<<"${single_command_output}"
grep -q 'autark-os install --yes' <<<"${single_command_output}"
[[ "$(grep -c 'Verifying release bundle checksum' <<<"${single_command_output}")" -eq 1 ]]
grep -q 'LAN URL:' <<<"${single_command_output}"

prompt_bundle="${tmp_dir}/prompt-bundle"
mkdir -p "${prompt_bundle}/scripts" "${prompt_bundle}/backend"
cp "${repo_root}/scripts/autark-os" "${prompt_bundle}/scripts/autark-os"
cp "${fake_jar}" "${prompt_bundle}/backend/autark-os-backend.jar"
printf '{"schemaVersion":1}\n' >"${prompt_bundle}/autark-os-release.json"
cat >"${prompt_bundle}/scripts/bootstrap-autark-os.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" >"${AUTARK_OS_BOOTSTRAP_ARGS_FILE}"
SH
chmod +x "${prompt_bundle}/scripts/autark-os" "${prompt_bundle}/scripts/bootstrap-autark-os.sh"

args_file="${tmp_dir}/bootstrap-args.txt"
if AUTARK_OS_BOOTSTRAP_ARGS_FILE="${args_file}" printf 'n\n' | "${prompt_bundle}/scripts/autark-os" install >/tmp/autark-os-prompt-decline.out 2>&1; then
  printf 'Expected declined install to exit non-zero.\n' >&2
  exit 1
fi
[[ ! -f "${args_file}" ]]
grep -q 'Install Autark-OS and supported dependencies on this host?' /tmp/autark-os-prompt-decline.out

AUTARK_OS_BOOTSTRAP_ARGS_FILE="${args_file}" "${prompt_bundle}/scripts/autark-os" install --yes >/tmp/autark-os-prompt-yes.out
grep -q -- '--auto-install-deps' "${args_file}"
! grep -q -- '--yes' "${args_file}"
grep -q 'Unified guided install' /tmp/autark-os-prompt-yes.out
