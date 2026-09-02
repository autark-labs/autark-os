# Controlled Beta Raspberry Pi Qualification

Use this checklist only on a non-critical Raspberry Pi prepared for destructive
testing. Qualify the exact release-candidate bundle that beta users will
receive; rebuilding afterward invalidates the result.

## Candidate record

Record these before starting:

- CE commit and release version
- private-agent commit and release digest
- control-plane commit and environment
- ARM64 bundle filename and SHA-256
- Raspberry Pi model, OS name/version, kernel, and free disk space
- test start time and operator

Do not record activation codes, tokens, hostnames, private URLs, or support
bundle contents in the qualification summary.

## 1. Isolated install check

Copy the extracted, verified ARM64 release bundle to the Pi. From the matching
CE source checkout, preview the isolated service first:

```bash
scripts/smoke-install-cycle.sh \
  --dry-run \
  --bundle-dir /absolute/path/to/autark-os-release \
  --smoke-name autark-os-beta-smoke \
  --port 18082
```

Review the planned paths, service name, user, architecture, and port. Then run
the same candidate and leave it installed for browser qualification:

```bash
scripts/smoke-install-cycle.sh \
  --run \
  --install-deps \
  --keep-install \
  --bundle-dir /absolute/path/to/autark-os-release \
  --work-dir /absolute/path/to/beta-evidence \
  --smoke-name autark-os-beta-smoke \
  --port 18082
```

This command must fail if installation, backend readiness, the catalog,
Activity Log, or support-bundle generation fails. Do not convert a failure into
a pass with manual service edits.

## 2. Owner workflow

Use the browser and ordinary appliance-owner UI for every step below:

1. Open the URL printed by the installer and claim the appliance.
2. Complete onboarding without using a development fixture or direct API.
3. Confirm Home gives one clear recommended next action.
4. Install one qualified starter app from Discover.
5. Confirm the install job survives a browser refresh and finishes accurately.
6. Open the app, change recognizable test data, and restart it from My Apps.
7. Configure a real backup destination and create a verified backup.
8. Change or delete the test data, review the restore plan, restore it, and
   verify the original data returns.
9. Reboot the Pi. Confirm Docker, Autark-OS, the managed app, login, Activity
   Log, and backup history recover without shell repair.
10. Re-run the installer with the same bundle and verify it is idempotent.

Any foreign Docker resource used during the test must appear as found or in
conflict, never as managed or installed by this Autark-OS instance.

## 3. Update and recovery

From the normal browser update surface:

1. Review and install the next signed CE candidate.
2. Confirm the exact reviewed plan is required and progress survives refresh.
3. Exercise a reviewed candidate that fails its normal health contract.
4. Confirm automatic rollback restores the prior release and ordinary CE
   mutations still work.
5. Confirm a failed smoke or update leaves an actionable notification and
   useful Diagnostics output, not a silent or indefinitely spinning state.

Do not add a production fault-injection switch. Use a staging-only candidate
whose normal health check fails.

## 4. Pro workflow

Against the production-shaped staging gateway and registry:

1. Activate Pro through the browser with a one-time code.
2. Install the assigned, signed ARM64 agent release.
3. Confirm CE remains usable while the agent is stopped, malformed, and
   temporarily unable to reach the control plane.
4. Review an eligible managed-app update. Confirm Guardian either recommends
   proceeding, requires protection first, defers with a reason, or blocks with
   a reason.
5. Start an allowed update. Confirm CE creates and verifies the safety
   checkpoint and remains the only component that performs the mutation.
6. Pause the assigned Pro release with the protected operator tool. Confirm a
   fresh release check returns no candidate. Resume it and confirm eligibility
   returns.
7. Withdraw a staging-only candidate and confirm it cannot be resumed or used
   for a new registry credential.
8. Remove and deactivate Pro through the browser. Confirm CE, managed apps,
   settings, backups, and user data remain intact.

## 5. Reliability window

Keep the appliance running for at least 24 hours for the first controlled beta
candidate. During the window:

- run scheduled backups and verify at least one;
- refresh Home, My Apps, Access, Backups, Storage, Activity Log, and
  Diagnostics from desktop and narrow browser widths;
- restart the Autark-OS service, Docker, and the host once each;
- disconnect and restore the network once;
- watch CPU, memory, disk use, restart counts, failed jobs, and log growth;
- verify no secret, activation code, credential, private URL, or raw hostname
  appears in exported support material.

The run fails on an unexplained restart loop, unbounded resource growth,
unrecoverable job, contradictory ownership state, lost user data, missing
rollback, or owner workflow that requires undocumented shell repair.

## 6. Evidence and decision

Preserve the generated support bundle privately, along with redacted
screenshots or notes for each step. Record every failure with its request ID,
job ID, release ID, time, user-visible message, and whether recovery was
automatic.

The candidate is a controlled-beta **go** only when all required steps pass or
an explicitly documented beta exception is approved. Security-review,
signing-key custody, platform coverage, and known-limitations statements must
match the exact candidate. A passing older Pi or older commit is not evidence
for the current release.

When finished, use the cleanup command printed by the smoke script. Verify the
isolated service, user, group, CLI link, and test-only data paths are removed.
