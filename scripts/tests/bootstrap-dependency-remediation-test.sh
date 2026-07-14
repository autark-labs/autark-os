#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fake_bin="${tmp_dir}/bin"
mkdir -p "${fake_bin}"

cat >"${fake_bin}/java" <<'SH'
#!/usr/bin/env bash
printf 'openjdk version "17.0.10" 2024-01-16\n' >&2
SH
chmod +x "${fake_bin}/java"

cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "version" ]]; then
  exit 0
fi
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  exit 1
fi
exit 1
SH
chmod +x "${fake_bin}/docker"

fake_jar="${tmp_dir}/autark-os-backend.jar"
printf 'fake jar\n' >"${fake_jar}"

output="$(PATH="${fake_bin}:/usr/bin:/bin" "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --auto-install-deps \
  --dry-run \
  --runtime-dir "${tmp_dir}/runtime" \
  --port 19091)"

grep -q 'openjdk-21-jre-headless' <<<"${output}"
grep -q 'Installing docker-compose-v2 for the existing distribution-managed Docker engine.' <<<"${output}"
grep -q 'apt-get install -y docker-compose-v2' <<<"${output}"
! grep -q 'docker.io docker-buildx-plugin docker-compose-plugin' <<<"${output}"
grep -Fq 'download.docker.com/linux/${family}/gpg' "${repo_root}/scripts/bootstrap-autark-os.sh"
grep -Fq 'docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin' "${repo_root}/scripts/bootstrap-autark-os.sh"
grep -q 'Autark-OS will not remove or replace an existing container runtime automatically' "${repo_root}/scripts/bootstrap-autark-os.sh"

cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "compose" && "${2:-}" == "version" ]]; then
  printf 'Docker Compose version v2.39.0\n'
  exit 0
fi
if [[ "${1:-}" == "version" || "${1:-}" == "info" ]]; then
  printf 'permission denied while trying to connect to the Docker daemon socket\n' >&2
  exit 1
fi
exit 1
SH
chmod +x "${fake_bin}/docker"

permission_output="$(PATH="${fake_bin}:/usr/bin:/bin" "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --auto-install-deps \
  --dry-run \
  --runtime-dir "${tmp_dir}/permission-runtime" \
  --port 19093)"

grep -q 'Existing Docker Engine and Compose v2 installation is compatible; preserving it.' <<<"${permission_output}"
grep -q 'Docker is installed, but its daemon is not reachable. Starting Docker.' <<<"${permission_output}"
! grep -q 'Installing Docker Engine and Compose v2' <<<"${permission_output}"
! grep -q 'Installing Tailscale' <<<"${permission_output}"
grep -q 'Tailscale is optional and is not installed or signed in during base installation.' <<<"${permission_output}"

missing_java_bin="${tmp_dir}/missing-java-bin"
mkdir -p "${missing_java_bin}"
for command_name in apt-get sudo dpkg-query findmnt df id getent install usermod groupadd useradd systemctl ln tailscale docker; do
  cat >"${missing_java_bin}/${command_name}" <<'SH'
#!/usr/bin/env bash
case "$(basename "$0")" in
  apt-get) exit 0 ;;
  sudo) "$@"; exit $? ;;
  dpkg-query) exit 1 ;;
  findmnt) exit 0 ;;
  df) printf 'Filesystem 1K-blocks Used Available Use%% Mounted on\n/dev/vda2 40960000 10000000 25000000 30%% /\n'; exit 0 ;;
  id) exit 1 ;;
  getent) exit 1 ;;
  docker) exit 127 ;;
  tailscale) exit 127 ;;
  *) exit 0 ;;
esac
SH
  chmod +x "${missing_java_bin}/${command_name}"
done

os_release_fixture="${tmp_dir}/os-release-2604"
cat >"${os_release_fixture}" <<'EOF'
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 26.04 LTS"
VERSION_ID="26.04"
EOF

missing_java_output="$(AUTARK_OS_OS_RELEASE_FIXTURE="${os_release_fixture}" AUTARK_OS_JAVA_BIN="${tmp_dir}/does-not-exist/java" PATH="${missing_java_bin}:/usr/bin:/bin" "${repo_root}/scripts/bootstrap-autark-os.sh" \
  --release-jar "${fake_jar}" \
  --auto-install-deps \
  --dry-run \
  --runtime-dir "${tmp_dir}/missing-java-runtime" \
  --install-dir "${tmp_dir}/missing-java-install" \
  --config-dir "${tmp_dir}/missing-java-config" \
  --log-dir "${tmp_dir}/missing-java-logs" \
  --port 19092)"

grep -q 'Package manager: apt (supported)' <<<"${missing_java_output}"
grep -q 'Dry run: service setup assumes Java 21 will be available after dependency installation.' <<<"${missing_java_output}"
grep -q 'Autark-OS installation preview completed.' <<<"${missing_java_output}"
grep -q 'LAN URL:' <<<"${missing_java_output}"
