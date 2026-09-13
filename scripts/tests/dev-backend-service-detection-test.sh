#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fixture_root="$(mktemp -d)"
trap 'rm -rf "${fixture_root}"' EXIT

mkdir -p "${fixture_root}/bin"

cat >"${fixture_root}/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

unit="${*: -1}"
if [[ "${1:-}" == "is-active" && "${unit}" == "project-os.service" ]]; then
  [[ " $* " == *" --quiet "* ]] || printf 'active\n'
  exit 0
fi
if [[ "${1:-}" == "is-active" ]]; then
  [[ " $* " == *" --quiet "* ]] || printf 'inactive\n'
  exit 3
fi
exit 0
EOF

cat >"${fixture_root}/bin/ss" <<'EOF'
#!/usr/bin/env bash
printf 'State Listen\nLISTEN 0\n'
EOF

cat >"${fixture_root}/bin/sudo" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

chmod +x "${fixture_root}/bin/systemctl" "${fixture_root}/bin/ss" "${fixture_root}/bin/sudo"

status_output="$(PATH="${fixture_root}/bin:${PATH}" "${repo_root}/scripts/dev-backend.sh" --status)"
grep -Fq 'autark-os.service: inactive' <<<"${status_output}"
grep -Fq 'project-os.service: active' <<<"${status_output}"

set +e
conflict_output="$(PATH="${fixture_root}/bin:${PATH}" "${repo_root}/scripts/dev-backend.sh" 2>&1)"
conflict_status=$?
set -e

[[ "${conflict_status}" -eq 1 ]]
grep -Fq 'project-os.service is active and is likely holding the production backend port.' <<<"${conflict_output}"
grep -Fq './scripts/dev-backend.sh --stop-service' <<<"${conflict_output}"

printf 'dev-backend legacy service detection test passed\n'
