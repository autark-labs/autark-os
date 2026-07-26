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
grep -q 'update     Run the unified Autark-OS update flow or one scoped stage.' <<<"${help_output}"
grep -q 'uninstall  Remove Autark-OS service paths through the guided uninstall flow.' <<<"${help_output}"

install_help="$("${repo_root}/scripts/autark-os" install --help)"
grep -q 'autark-os install --guided' <<<"${install_help}"
grep -q 'autark-os install --plan --json' <<<"${install_help}"
grep -q 'Routes to bootstrap-autark-os.sh' <<<"${install_help}"

installed_dir="${tmp_dir}/installed/bin"
link_dir="${tmp_dir}/path-bin"
mkdir -p "${installed_dir}" "${link_dir}"
cp "${repo_root}/scripts/autark-os" "${installed_dir}/autark-os"
cat >"${installed_dir}/bootstrap-autark-os.sh" <<'SH'
#!/usr/bin/env bash
printf 'resolved-bootstrap %s\n' "$*"
SH
chmod +x "${installed_dir}/autark-os" "${installed_dir}/bootstrap-autark-os.sh"
ln -s "${installed_dir}/autark-os" "${link_dir}/autark-os"
symlink_output="$(cd "${tmp_dir}" && "${link_dir}/autark-os" install --plan --release-jar "${fake_jar}")"
grep -q 'resolved-bootstrap --plan --release-jar' <<<"${symlink_output}"

"${repo_root}/scripts/autark-os" repair --help >/dev/null
update_help="$("${repo_root}/scripts/autark-os" update --help)"
grep -q 'runs the complete update chain' <<<"${update_help}"
grep -q 'check       Check the configured channel' <<<"${update_help}"
grep -q 'rollback    Restore the most recent pre-update snapshot' <<<"${update_help}"
"${repo_root}/scripts/autark-os" uninstall --help >/dev/null

bundle_dir="${tmp_dir}/bundle"
architecture="$(dpkg --print-architecture)"
mkdir -p "${bundle_dir}/scripts" "${bundle_dir}/backend" "${bundle_dir}/runtime/bin"
cp "${repo_root}/scripts/autark-os" "${bundle_dir}/scripts/autark-os"
cp "${repo_root}/scripts/autark-os-fileops" "${bundle_dir}/scripts/autark-os-fileops"
cp "${repo_root}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/bootstrap-autark-os.sh"
cp "${repo_root}/scripts/install-autark-os-service.sh" "${bundle_dir}/scripts/install-autark-os-service.sh"
cp "${repo_root}/scripts/supported-host-matrix.env" "${bundle_dir}/scripts/supported-host-matrix.env"
cp "${fake_jar}" "${bundle_dir}/backend/autark-os-backend.jar"
cat >"${bundle_dir}/runtime/bin/java" <<'SH'
#!/usr/bin/env bash
printf 'openjdk version "21.0.0"\n' >&2
SH
chmod +x "${bundle_dir}/runtime/bin/java"
cat >"${bundle_dir}/autark-os-release.env" <<ENV
AUTARK_OS_ARTIFACT_ARCHITECTURE=${architecture}
AUTARK_OS_RUNTIME_ARCHITECTURE=${architecture}
ENV
printf '{"schemaVersion":2,"artifactArchitecture":"%s"}\n' "${architecture}" >"${bundle_dir}/autark-os-release.json"
chmod +x "${bundle_dir}/scripts/autark-os" "${bundle_dir}/scripts/autark-os-fileops" "${bundle_dir}/scripts/bootstrap-autark-os.sh" "${bundle_dir}/scripts/install-autark-os-service.sh"

fake_file_bin="${tmp_dir}/fake-file-bin"
mkdir -p "${fake_file_bin}"
cat >"${fake_file_bin}/file" <<SH
#!/usr/bin/env bash
case "${architecture}" in
  amd64) printf '%s\n' 'ELF 64-bit LSB executable, x86-64' ;;
  arm64) printf '%s\n' 'ELF 64-bit LSB executable, ARM aarch64' ;;
esac
SH
chmod +x "${fake_file_bin}/file"

bundle_output="$(PATH="${fake_file_bin}:${PATH}" "${bundle_dir}/scripts/autark-os" install \
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
(cd "${bundle_dir}" && sha256sum backend/autark-os-backend.jar runtime/bin/java scripts/autark-os scripts/autark-os-fileops scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh scripts/supported-host-matrix.env autark-os-release.env autark-os-release.json > SHA256SUMS)

single_command_output="$(PATH="${fake_file_bin}:${PATH}" "${bundle_dir}/scripts/autark-os" install \
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
grep -q 'Installed shared installer helpers beside the Autark-OS command.' <<<"${single_command_output}"
grep -q 'autark-os install --yes' <<<"${single_command_output}"
[[ "$(grep -c 'Verifying release bundle checksum' <<<"${single_command_output}")" -eq 1 ]]
grep -q 'LAN URL:' <<<"${single_command_output}"

prompt_bundle="${tmp_dir}/prompt-bundle"
mkdir -p "${prompt_bundle}/scripts" "${prompt_bundle}/backend" "${prompt_bundle}/runtime/bin"
cp "${repo_root}/scripts/autark-os" "${prompt_bundle}/scripts/autark-os"
cp "${repo_root}/scripts/autark-os-fileops" "${prompt_bundle}/scripts/autark-os-fileops"
cp "${repo_root}/scripts/install-autark-os-service.sh" "${prompt_bundle}/scripts/install-autark-os-service.sh"
cp "${fake_jar}" "${prompt_bundle}/backend/autark-os-backend.jar"
cp "${bundle_dir}/runtime/bin/java" "${prompt_bundle}/runtime/bin/java"
printf '{"schemaVersion":2,"artifactArchitecture":"%s"}\n' "${architecture}" >"${prompt_bundle}/autark-os-release.json"
cat >"${prompt_bundle}/scripts/bootstrap-autark-os.sh" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" >"${AUTARK_OS_BOOTSTRAP_ARGS_FILE}"
SH
chmod +x "${prompt_bundle}/scripts/autark-os" "${prompt_bundle}/scripts/bootstrap-autark-os.sh"
(cd "${prompt_bundle}" && sha256sum backend/autark-os-backend.jar runtime/bin/java scripts/autark-os scripts/autark-os-fileops scripts/bootstrap-autark-os.sh scripts/install-autark-os-service.sh autark-os-release.json >SHA256SUMS)

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
