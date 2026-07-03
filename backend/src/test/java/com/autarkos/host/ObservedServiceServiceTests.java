package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class ObservedServiceServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void unpinRemovesServiceFromMyAppsButDoesNotDeleteObservedTruth() {
        ObservedServiceRepository repository = repository();
        ObservedServiceService service = service(repository, List.of());
        repository.upsert(observed("obs_vaultwarden", "manual_url", "http://vault.local", "Vaultwarden", "vaultwarden", "external", "pinned"));

        ActionResult result = service.unpin("obs_vaultwarden");

        assertThat(result.ok()).isTrue();
        assertThat(repository.findById("obs_vaultwarden")).hasValueSatisfying(observed -> {
            assertThat(observed.userVisibility()).isEqualTo("observed");
            assertThat(observed.pinnedAt()).isNull();
        });
        assertThat(service.list(true)).extracting(ObservedServiceView::id).contains("obs_vaultwarden");
        assertThat(service.matchingCatalogServices("vaultwarden")).extracting(ObservedService::id).contains("obs_vaultwarden");
    }

    @Test
    void refreshPreservesPinnedStateAndUserCatalogMatch() {
        ObservedServiceRepository repository = repository();
        Instant pinnedAt = Instant.parse("2026-06-21T12:00:00Z");
        repository.upsert(observed("docker:autark-os-vault", "docker", "autark-os-vault", "Vault", "vaultwarden", "external_docker", "pinned", pinnedAt));
        ObservedServiceService service = service(repository, List.of(new HostDockerContainer(
                "autark-os-vault",
                "vaultwarden/server:latest",
                "Up 2 minutes",
                Map.of(),
                "0.0.0.0:8081->80/tcp")));

        service.refresh();

        assertThat(repository.findById("docker:autark-os-vault")).hasValueSatisfying(observed -> {
            assertThat(observed.catalogAppId()).isEqualTo("vaultwarden");
            assertThat(observed.catalogMatchConfidence()).isEqualTo("user");
            assertThat(observed.userVisibility()).isEqualTo("pinned");
            assertThat(observed.pinnedAt()).isEqualTo(pinnedAt);
            assertThat(observed.runtimeState()).isEqualTo("running");
            assertThat(observed.url()).isEqualTo("http://localhost:8081");
        });
    }

    @Test
    void refreshReturnsUnmatchedAndIgnoredContainers() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:ignored-postgres", "docker", "ignored-postgres", "Postgres", null, "external_docker", "ignored"));
        ObservedServiceService service = service(repository, List.of(
                new HostDockerContainer("unmatched-worker", "worker:latest", "Up 5 seconds", Map.of(), ""),
                new HostDockerContainer("ignored-postgres", "postgres:16", "Up 1 hour", Map.of(), "")));

        List<ObservedServiceView> observed = service.refresh();

        assertThat(observed).extracting(ObservedServiceView::id)
                .contains("docker:unmatched-worker", "docker:ignored-postgres");
        assertThat(observed).filteredOn(view -> view.id().equals("docker:unmatched-worker"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.catalogAppId()).isNull();
                    assertThat(view.userStatus()).isEqualTo("found_on_server");
                    assertThat(view.availableActions()).extracting(ObservedServiceAction::id).contains("pin", "change_match");
                });
        assertThat(observed).filteredOn(view -> view.id().equals("docker:ignored-postgres"))
                .singleElement()
                .satisfies(view -> assertThat(view.ownershipState()).isEqualTo("external_docker"));
    }

    @Test
    void refreshRemovesStaleUnpinnedDockerServicesAfterSuccessfulScan() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:old-autark-os-vault", "docker", "old-autark-os-vault", "Old Vault", "vaultwarden", "legacy_autark_os", "observed"));
        repository.upsert(observed("docker:pinned-lab-link", "docker", "pinned-lab-link", "Pinned Lab", null, "external_docker", "pinned", Instant.parse("2026-06-21T12:00:00Z")));
        repository.upsert(observed("manual:gitlab", "manual_url", "http://gitlab.local", "GitLab", "gitlab", "external", "pinned"));
        ObservedServiceService service = service(repository, List.of(new HostDockerContainer(
                "current-worker",
                "worker:latest",
                "Up 5 seconds",
                Map.of(),
                "")));

        service.refresh();

        assertThat(repository.findById("docker:old-autark-os-vault")).isEmpty();
        assertThat(repository.findById("docker:pinned-lab-link")).isPresent();
        assertThat(repository.findById("manual:gitlab")).isPresent();
        assertThat(repository.findById("docker:current-worker")).isPresent();
    }

    @Test
    void adoptRecoverableServiceUsesRuntimeMetadataWhenObservedMetadataIsIncomplete() throws Exception {
        ObservedServiceRepository observedRepository = repository();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout());
        Path appRoot = runtimeRoot.resolve("apps/syncthing");
        java.nio.file.Files.createDirectories(appRoot);
        java.nio.file.Files.writeString(appRoot.resolve("autark-os-app.json"), """
                {
                  "appInstanceId" : "appinst_runtime_syncthing",
                  "catalogAppId" : "syncthing",
                  "instanceId" : "current-instance",
                  "composeProject" : "autarkos_dev_current_syncthing",
                  "manifestVersion" : "2.1.1",
                  "createdAt" : "2026-06-21T12:00:00Z"
                }
                """);
        observedRepository.upsert(new ObservedService(
                "docker:autark-os-syncthing",
                "docker",
                "autark-os-syncthing",
                "syncthing",
                "http://localhost:8384",
                "External",
                "LAN",
                "syncthing",
                "inferred",
                "legacy_autark_os",
                "observed",
                "running",
                false,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                null,
                null,
                "{\"containerName\":\"autark-os-syncthing\"}"));
        ObservedServiceService service = new ObservedServiceService(
                observedRepository,
                new ObservedServiceScanner(List::of, currentIdentity()),
                installedRepository,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                currentIdentity(),
                null);

        ObservedServiceAdoptionPlan plan = service.adoptionPlan("docker:autark-os-syncthing");
        ActionResult result = service.adopt("docker:autark-os-syncthing", new ObservedServiceAdoptionRequest(true, true, plan.confirmationText()));

        assertThat(result.ok()).isTrue();
        assertThat(installedRepository.findById("syncthing")).hasValueSatisfying(app -> {
            assertThat(app.runtimePath()).isEqualTo(appRoot.toString());
            assertThat(app.composeProject()).isEqualTo("autarkos_dev_current_syncthing");
        });
        assertThat(installedRepository.ownershipFor("syncthing")).hasValueSatisfying(ownership -> {
            assertThat(ownership.appInstanceId()).isEqualTo("appinst_runtime_syncthing");
            assertThat(ownership.autarkOsInstanceId()).isEqualTo("current-instance");
            assertThat(ownership.runtimePathOrHash()).isEqualTo(appRoot.toString());
        });
    }

    @Test
    void observedServiceViewsExposeCanonicalApplicationStates() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:managed", "docker", "managed", "Managed", "homepage", "owned_managed", "observed", "running"));
        repository.upsert(observed("docker:linked", "docker", "linked", "Linked", "gitlab", "external_docker", "pinned", "running"));
        repository.upsert(observed("docker:found", "docker", "found", "Found", null, "external_docker", "visible", "paused"));
        repository.upsert(observed("docker:recoverable", "docker", "recoverable", "Recoverable", "vaultwarden", "legacy_autark_os", "visible", "running"));
        repository.upsert(observed("docker:foreign", "docker", "foreign", "Foreign", "jellyfin", "foreign_autark_os", "visible", "running"));
        repository.upsert(observed("docker:conflict", "docker", "conflict", "Conflict", "pi-hole", "unknown_conflict", "visible", "unhealthy"));
        ObservedServiceService service = service(repository, List.of());

        List<ObservedServiceView> views = service.list(true);

        assertThat(views).filteredOn(view -> view.id().equals("docker:managed"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.managementState()).isEqualTo("managed");
                    assertThat(view.readinessState()).isEqualTo("ready");
                    assertThat(view.attentionState()).isEqualTo("none");
                });
        assertThat(views).filteredOn(view -> view.id().equals("docker:linked"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.managementState()).isEqualTo("linked");
                    assertThat(view.readinessState()).isEqualTo("ready");
                    assertThat(view.attentionState()).isEqualTo("none");
                });
        assertThat(views).filteredOn(view -> view.id().equals("docker:found"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.managementState()).isEqualTo("found");
                    assertThat(view.readinessState()).isEqualTo("paused");
                    assertThat(view.attentionState()).isEqualTo("needs_review");
                });
        assertThat(views).filteredOn(view -> view.id().equals("docker:recoverable"))
                .singleElement()
                .satisfies(view -> assertThat(view.attentionState()).isEqualTo("needs_review"));
        assertThat(views).filteredOn(view -> view.id().equals("docker:foreign"))
                .singleElement()
                .satisfies(view -> assertThat(view.attentionState()).isEqualTo("conflict"));
        assertThat(views).filteredOn(view -> view.id().equals("docker:conflict"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.readinessState()).isEqualTo("unreachable");
                    assertThat(view.attentionState()).isEqualTo("blocked");
                });
    }

    @Test
    void adoptRecoverableServiceCreatesManagedAppStateAndPreservesObservedTruth() {
        ObservedServiceRepository observedRepository = repository();
        InstalledAppRepository installedRepository = new InstalledAppRepository(runtimeLayout());
        observedRepository.upsert(new ObservedService(
                "docker:autark-os-vaultwarden",
                "docker",
                "autark-os-vaultwarden",
                "vaultwarden",
                "http://localhost:8090",
                "External",
                "LAN",
                "vaultwarden",
                "inferred",
                "legacy_autark_os",
                "observed",
                "running",
                false,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                null,
                null,
                "{\"containerName\":\"autark-os-vaultwarden\",\"composeProject\":\"autark-os-vaultwarden\",\"appInstanceId\":\"appinst_legacy_vault\",\"dataPaths\":\"/var/lib/autark-os/apps/vaultwarden\"}"));
        ObservedServiceService service = new ObservedServiceService(
                observedRepository,
                new ObservedServiceScanner(List::of, currentIdentity()),
                installedRepository,
                new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator()),
                currentIdentity(),
                null);

        ObservedServiceAdoptionPlan plan = service.adoptionPlan("docker:autark-os-vaultwarden");
        ActionResult result = service.adopt("docker:autark-os-vaultwarden", new ObservedServiceAdoptionRequest(true, true, plan.confirmationText()));

        assertThat(plan.available()).isTrue();
        assertThat(result.ok()).isTrue();
        assertThat(installedRepository.findById("vaultwarden")).hasValueSatisfying(app -> {
            assertThat(app.appName()).isEqualTo("Vaultwarden");
            assertThat(app.accessUrl()).isEqualTo("http://localhost:8090");
            assertThat(app.runtimePath()).isEqualTo("/var/lib/autark-os/apps/vaultwarden");
        });
        assertThat(installedRepository.ownershipFor("vaultwarden")).hasValueSatisfying(ownership -> {
            assertThat(ownership.installState()).isEqualTo("adopted");
            assertThat(ownership.ownershipStatus()).isEqualTo("owned");
            assertThat(ownership.autarkOsInstanceId()).isEqualTo("current-instance");
        });
        assertThat(installedRepository.settingsFor("vaultwarden")).hasValueSatisfying(settings -> assertThat(settings.accessUrl()).isEqualTo("http://localhost:8090"));
        assertThat(observedRepository.findById("docker:autark-os-vaultwarden")).hasValueSatisfying(observed -> {
            assertThat(observed.ownershipState()).isEqualTo("owned_managed");
            assertThat(observed.userVisibility()).isEqualTo("observed");
            assertThat(observed.autarkOsInstanceId()).isEqualTo("current-instance");
        });
    }

    private ObservedServiceService service(ObservedServiceRepository repository, List<HostDockerContainer> containers) {
        ObservedServiceScanner scanner = new ObservedServiceScanner(() -> containers, currentIdentity());
        return new ObservedServiceService(repository, scanner);
    }

    private java.util.function.Supplier<com.autarkos.system.AutarkOsIdentity> currentIdentity() {
        return () -> new com.autarkos.system.AutarkOsIdentity(
                "current-instance",
                "autark-os",
                runtimeRoot.toString(),
                "runtime-hash",
                Instant.parse("2026-06-20T12:00:00Z"),
                1);
    }

    private ObservedServiceRepository repository() {
        return new ObservedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ObservedService observed(String id, String source, String fingerprint, String displayName, String catalogAppId, String ownershipState, String visibility) {
        return observed(id, source, fingerprint, displayName, catalogAppId, ownershipState, visibility, (Instant) null);
    }

    private ObservedService observed(String id, String source, String fingerprint, String displayName, String catalogAppId, String ownershipState, String visibility, String runtimeState) {
        return observed(id, source, fingerprint, displayName, catalogAppId, ownershipState, visibility, null, runtimeState);
    }

    private ObservedService observed(String id, String source, String fingerprint, String displayName, String catalogAppId, String ownershipState, String visibility, Instant pinnedAt) {
        return observed(id, source, fingerprint, displayName, catalogAppId, ownershipState, visibility, pinnedAt, "unknown");
    }

    private ObservedService observed(String id, String source, String fingerprint, String displayName, String catalogAppId, String ownershipState, String visibility, Instant pinnedAt, String runtimeState) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id,
                source,
                fingerprint,
                displayName,
                source.equals("manual_url") ? fingerprint : null,
                "External",
                "LAN",
                catalogAppId,
                catalogAppId == null ? "unknown" : "user",
                ownershipState,
                visibility,
                runtimeState,
                false,
                "",
                seenAt,
                seenAt,
                pinnedAt,
                visibility.equals("ignored") ? seenAt : null,
                "{}");
    }
}
