package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;

class ObservedServiceServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void failedDockerInventoryRetainsPreviouslyFoundServicesInsteadOfDeletingThem() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:existing", "docker", "existing", "Existing app", "homepage", "external_docker", "observed"));
        HostDockerContainerDiscovery unavailableDocker = new HostDockerContainerDiscovery() {
            @Override
            public List<HostModels.HostDockerContainer> findContainers() {
                return List.of();
            }

            @Override
            public DockerInventory observeContainers() {
                return DockerInventory.failed("Docker status check timed out.");
            }
        };
        ObservedServiceService service = new ObservedServiceService(repository, new ObservedServiceScanner(unavailableDocker, currentIdentity()));

        assertThatThrownBy(service::refresh).isInstanceOf(HostInventoryException.class);
        assertThat(repository.findServiceById("docker:existing")).isPresent();
    }

    @Test
    void foundAppsExposeNoPinOrManualMatchActions() {
        var found = ObservedServiceService.toView(observed("obs_vaultwarden", "manual_url", "http://vault.local", "Vaultwarden", "vaultwarden", "external", "pinned"));
        assertThat(found.availableActions()).extracting(HostModels.ObservedServiceAction::id)
                .contains("open", "unavailable").doesNotContain("pin", "unpin", "change_match", "install_copy", "recovery_plan");
        var eligible = ObservedServiceService.toView(observed("obs_homepage", "manual_url", "http://homepage.local", "Homepage", "homepage", "external", "pinned"));
        assertThat(eligible.availableActions()).extracting(HostModels.ObservedServiceAction::id).contains("install_copy");
    }

    @Test
    void refreshUsesObservedDockerOwnershipInsteadOfPreservingARecordedClaim() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:autark-os-vault", "docker", "autark-os-vault", "Vault", "vaultwarden", "owned_managed", "observed"));
        ObservedServiceService service = service(repository, List.of(new HostModels.HostDockerContainer(
                "autark-os-vault", "vaultwarden/server:latest", "Up 2 minutes", Map.of(), "0.0.0.0:8081->80/tcp")));

        service.refresh();

        assertThat(repository.findServiceById("docker:autark-os-vault")).hasValueSatisfying(observed -> {
            assertThat(observed.ownershipState()).isEqualTo("external_docker");
            assertThat(observed.autarkOsInstanceId()).isNull();
            assertThat(observed.url()).isEqualTo("http://localhost:8081");
        });
    }

    @Test
    void refreshReturnsUnmatchedAndIgnoredContainers() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:ignored-postgres", "docker", "ignored-postgres", "Postgres", null, "external_docker", "ignored"));
        ObservedServiceService service = service(repository, List.of(
                new HostModels.HostDockerContainer("unmatched-worker", "worker:latest", "Up 5 seconds", Map.of(), ""),
                new HostModels.HostDockerContainer("ignored-postgres", "postgres:16", "Up 1 hour", Map.of(), "")));

        List<ObservedServiceView> observed = service.refresh();

        assertThat(observed).extracting(ObservedServiceView::id).contains("docker:unmatched-worker", "docker:ignored-postgres");
        assertThat(repository.findServiceById("docker:ignored-postgres")).hasValueSatisfying(serviceView ->
                assertThat(serviceView.userVisibility()).isEqualTo("ignored"));
    }

    @Test
    void refreshRemovesAllStaleDockerServicesAfterSuccessfulScan() {
        ObservedServiceRepository repository = repository();
        repository.upsert(observed("docker:old-autark-os-vault", "docker", "old-autark-os-vault", "Old Vault", "vaultwarden", "legacy_autark_os", "observed"));
        repository.upsert(observed("manual:gitlab", "manual_url", "http://gitlab.local", "GitLab", "gitlab", "external", "pinned"));
        ObservedServiceService service = service(repository, List.of(new HostModels.HostDockerContainer("current-worker", "worker:latest", "Up 5 seconds", Map.of(), "")));

        service.refresh();

        assertThat(repository.findServiceById("docker:old-autark-os-vault")).isEmpty();
        assertThat(repository.findServiceById("manual:gitlab")).isPresent();
        assertThat(repository.findServiceById("docker:current-worker")).isPresent();
    }

    @Test
    void recoverableDockerEvidenceLinksOnlyToTheRecoveryApi() {
        ObservedServiceView view = ObservedServiceService.toView(observed(
                "docker:recoverable", "docker", "recoverable", "Vaultwarden", "vaultwarden", "legacy_autark_os", "observed"));

        assertThat(view.recoveryCandidate()).isTrue();
        assertThat(view.availableActions()).extracting(HostModels.ObservedServiceAction::id)
                .contains("recovery_plan").doesNotContain("adoption_plan");
        assertThat(view.availableActions()).filteredOn(action -> action.id().equals("recovery_plan"))
                .singleElement().satisfies(action -> {
                    assertThat(action.href()).isEqualTo("/api/app-recovery/vaultwarden/plan");
                    assertThat(action.method()).isEqualTo("GET");
                });
    }

    private ObservedServiceService service(ObservedServiceRepository repository, List<HostModels.HostDockerContainer> containers) {
        return new ObservedServiceService(repository, new ObservedServiceScanner(() -> containers, currentIdentity()));
    }

    private java.util.function.Supplier<com.autarkos.system.AutarkOsIdentity> currentIdentity() {
        return () -> new com.autarkos.system.AutarkOsIdentity(
                "current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash",
                Instant.parse("2026-06-20T12:00:00Z"), 1);
    }

    private ObservedServiceRepository repository() {
        return JpaTestRepositories.observedServiceRepository(runtimeLayout());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ObservedService observed(String id, String source, String fingerprint, String displayName, String catalogAppId, String ownershipState, String visibility) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id, source, fingerprint, displayName, source.equals("manual_url") ? fingerprint : null,
                "External", "LAN", catalogAppId, catalogAppId == null ? "unknown" : "user",
                ownershipState, visibility, "unknown", false, "", seenAt, seenAt, null,
                visibility.equals("ignored") ? seenAt : null, "{}");
    }
}
