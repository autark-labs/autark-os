# Third-Party Components

Autark-OS includes third-party software. Those components remain under their
own licenses; this file does not replace their notices or grant additional
rights.

## Where To Find Component Information

- The bundled Java runtime includes its own license material under
  `runtime/legal/` in this release.
- `THIRD_PARTY_COMPONENTS.txt` lists the Java libraries packaged inside the
  Autark-OS backend JAR.
- `THIRD_PARTY_FRONTEND_LOCK.txt` records the frontend dependency resolutions
  used to create the bundled web assets.

This release does not yet include a complete SPDX or CycloneDX software bill of
materials. When an SBOM is available, it will be published alongside release
assets and referenced from the release manifest. Until then, use the included
runtime notices and dependency inventories when reviewing this release.

## Dashboard Icons

The bundled application artwork in `frontend/public/app-images` and
`backend/src/main/resources/static/app-images` is sourced from
[Homarr Dashboard Icons](https://github.com/homarr-labs/dashboard-icons), commit
`46b860c70e866212311aef2f98da3775c17f5068`, with the following mappings:

- `obsidian-livesync.svg` uses the source collection's Obsidian mark because a
  dedicated LiveSync mark is not published there.

Dashboard Icons is licensed under the Apache License, Version 2.0. A copy is
included in `docs/third-party-licenses/dashboard-icons-Apache-2.0.txt`.

## Sigstore Cosign

Portable release bundles include the pinned
[Sigstore Cosign](https://github.com/sigstore/cosign) command-line verifier.
Autark-OS uses it to verify the short-lived GitHub Actions signing identity and
release annotations on an exact Autark Pro agent image digest before
activation. Cosign is licensed under the Apache License, Version 2.0; its
license is included in release bundles as `tools/cosign-LICENSE`.
