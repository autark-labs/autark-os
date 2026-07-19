# Autark Pro Repository Inventory

- Inventory baseline: CE commit `06762e377f6e818dd8ac0c90a75644cf1d75a3e6`
- Recorded: 2026-07-19
- Public Java package root: `com.autarkos`

## Public CE Seams

| Concern | Current implementation | Pro integration direction |
| --- | --- | --- |
| Existing Pro route | `frontend/src/pages/ProPage/ProPage.tsx`, `/pro` in `App.tsx` and `navigationModel.ts` | Evolve this route and shell; do not add another frontend |
| Docker abstraction | `DockerComposeExecutor`, `ProcessDockerComposeExecutor`, `SystemCommandRunner` | Add a narrow public agent-runtime adapter; never expose the generic runner |
| Runtime paths | `RuntimeLayout` under the configured Autark runtime root | Add protected Pro config/state below established config/runtime paths |
| Persistence | SQLite, Flyway migrations, Spring Data JPA, `AutarkOsDatabase` | Add migrations after V18 and repository/domain types under `com.autarkos.pro` |
| Durable jobs | `AutarkOsJobService`, `AutarkOsJobRepository`, `/api/jobs` | Reuse progress UI; add explicit Pro restart reconciliation instead of relying only on generic interrupted-job failure |
| Activity/event model | `ActivityLogService`, `ActivityLogEntity`, `/api/activity` | Reuse presentation and filtering; add mandatory pre-persistence redaction and fail-safe audit semantics |
| Secure local files | `AdminLocalCredentialStore`, `RuntimeLayout.configRoot()` | Add a separate `DeviceKeyStore`; reuse atomic owner-only file techniques, not administrator secrets |
| Redaction | `SupportDataRedactor`, support-report pipeline | Reuse patterns where safe and add structured Pro context allowlists |
| App state/data | marketplace install services, application-state providers, backups, access, storage, monitoring, activity | Snapshot only through public CE services and repositories |
| Frontend tests | Vitest contract/component tests and Playwright configuration | Add state fixtures, accessibility checks, and CE smoke coverage |
| Backend tests | Gradle/JUnit, temporary runtime/database fixtures | Add unit, crypto-vector, persistence, runtime-policy, and integration tests |

## Existing Conflicts to Replace

- The current Pro page describes a separate standalone application and forbids
  registration. PRO-106 replaces that copy and behavior in the same route.
- Flyway V15 intentionally removed an earlier Pro runtime prototype. New Pro
  persistence starts with additive migrations after the current V18 baseline;
  old V10–V14 tables are not revived.
- Existing best-effort activity persistence is not sufficient for every
  security-sensitive Pro transition. PRO-114 defines the fail-safe path.
- Generic interrupted jobs are marked failed on startup. The Pro module state
  machine needs its own deterministic resume/unwind logic in PRO-109.

## Private Repositories

| Repository | Current state | Prototype responsibility |
| --- | --- | --- |
| `autark-os-pro` | Supabase prototype with pre-stable accountless/mobile APIs | Replace as needed with device proof, grants/leases, releases, scoped tokens, and RLS |
| `autark-os-pro-client` | Empty initial repository | Build the private Go `autark-pro-agent`, schemas, tests, container, and release workflow |
| `project-os-mobile` | Kotlin Multiplatform preview | Outside PRO-208; do not modify for the prototype |

Private repository URLs, signing material, registry credentials, and proprietary
source are intentionally absent from this public inventory.
