# Release Artifacts Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one maintainer command that produces GitHub-hostable `.tar.gz`, `.deb`, and self-extracting GUI-style `.run` installer artifacts from the existing Project OS release bundle.

**Architecture:** Keep `scripts/build-release-bundle.sh` as the source of truth for release contents. Add `scripts/build-release-artifacts.sh` as a packaging wrapper that calls the bundle builder, creates distribution artifacts, writes checksums, and avoids duplicating installer logic.

**Tech Stack:** Bash, Gradle/Vite release bundle, `tar`, `dpkg-deb`, existing Project OS installer scripts.

---

### Task 1: Packaging Contract Tests

**Files:**
- Create: `scripts/tests/release-artifacts-contract-test.sh`
- Create: `scripts/tests/release-artifacts-dry-run-test.sh`

- [ ] Write a failing contract test that builds artifacts with a fake backend jar and verifies `.tar.gz`, `.deb`, `.run`, metadata, and checksums.
- [ ] Write a dry-run test that verifies the builder prints intended artifact creation commands without mutating the output directory.
- [ ] Run both tests and confirm they fail because `scripts/build-release-artifacts.sh` does not exist.

### Task 2: Artifact Builder

**Files:**
- Create: `scripts/build-release-artifacts.sh`

- [ ] Implement argument parsing for version, channel, release notes URL, output directory, architecture, skip-build, and dry-run.
- [ ] Call `scripts/build-release-bundle.sh` to generate the canonical bundle.
- [ ] Package the bundle as `project-os-VERSION.tar.gz`.
- [ ] Package the bundle into `project-os_VERSION_ARCH.deb` with `DEBIAN/control`, `postinst`, and `prerm`.
- [ ] Package the bundle into `Project-OS-Installer-VERSION-ARCH.run` as a self-extracting guided launcher.
- [ ] Write top-level `SHA256SUMS` and `project-os-artifacts.json`.
- [ ] Run the contract tests until they pass.

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/beta-installation.md`

- [ ] Document the maintainer release command.
- [ ] Document user install choices for `.run`, `.deb`, and `.tar.gz`.
- [ ] Keep advanced checks as support commands rather than the normal install path.

### Task 4: Release Validation

**Commands:**
- `scripts/tests/release-artifacts-contract-test.sh`
- `scripts/tests/release-artifacts-dry-run-test.sh`
- `scripts/tests/release-bundle-contract-test.sh`
- `scripts/tests/public-installer-download-flow-test.sh`
- `scripts/smoke-install-cycle.sh`
- `frontend/yarn typecheck`
- `frontend/yarn build`
- `backend/./gradlew cleanTest test`
- `backend/./gradlew bootJar`
- `git diff --check`

- [ ] Run targeted packaging tests.
- [ ] Run existing release bundle/public installer tests.
- [ ] Run frontend and backend validation.
- [ ] Report any remaining release risks.
