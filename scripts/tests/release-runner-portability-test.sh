#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# The native ARM GitHub runner provides the standard GNU userland but not
# ripgrep. Release scripts must stay runnable from that baseline rather than
# acquiring an undeclared tool dependency that fails only after a tag exists.
command_pattern='(^|[^[:alnum:]_])r[g]([[:space:]]|$)'
if grep -R -n -E --include='*.sh' -- "${command_pattern}" "${repo_root}/scripts"; then
  printf 'Release scripts must not require ripgrep; use grep or another baseline tool.\n' >&2
  exit 1
fi

# GNU awk warns about an escaped quote inside a regular-expression literal,
# while mawk accepts it silently. The release runner uses GNU awk, so reject
# that non-portable spelling before a tagged build reaches the ARM matrix.
if grep -n -E -- '(sub|gsub)\(/[^/]*\\"' "${repo_root}/scripts/autark-os"; then
  printf 'Updater awk expressions must not escape quotes inside regex literals.\n' >&2
  exit 1
fi
