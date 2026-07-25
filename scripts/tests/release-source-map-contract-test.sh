#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
vite_config="${repo_root}/frontend/vite.config.js"
build_file="${repo_root}/backend/build.gradle"

# Production defaults to no map output. Release CI can request hidden maps for
# a private workflow artifact, but Gradle must always exclude them from the
# Spring Boot jar that becomes the public installer payload.
grep -Fq "sourcemap: process.env.AUTARK_OS_PRIVATE_SOURCEMAPS === '1' ? 'hidden' : false" "${vite_config}"
grep -Fq "exclude '**/*.map'" "${build_file}"
grep -Fq 'frontend source maps' "${repo_root}/.github/workflows/release.yml"
