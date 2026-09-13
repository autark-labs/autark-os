package com.autarkos.apps;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.host.ObservedServiceScanner;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.testsupport.JpaTestRepositories;

class ApplicationInventoryServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void discoverOpenUsesTheSameVerifiedPrivateLinkAsManagedAppViews() {
        var repository = installedRepository();
        repository.save(new InstalledApp("syncthing", "Syncthing", "Ready", runtimeRoot.resolve("apps/syncthing").toString(),
                "owned_syncthing", "http://localhost:18384", Instant.now()));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "syncthing", "instance", "syncthing", "current-instance", "runtime-hash",
                "installed", "owned", Instant.now(), Instant.now()));
        var managed = new com.autarkos.marketplace.install.AppInstanceView("instance", "syncthing", "Syncthing", "Productivity", "",
                "Ready", "ready", "running", "owned", "private_ready", "backup_disabled", "http://localhost:18384",
                "https://server.example.ts.net:14384", List.of(), List.of(), Instant.now());
        var service = new ApplicationInventoryService(catalogService(), repository, observedService(observedRepository()), dockerOwnershipService(),
                () -> List.of(managed));
        var view = service.app("syncthing").orElseThrow();
        assertThat(view.accessState()).isEqualTo("private_ready");
        assertThat(view.availableActions()).anySatisfy(action -> assertThat(action.href()).isEqualTo(managed.privateUrl()));
        assertThat(repository.findAppById("syncthing").orElseThrow().accessUrl()).isEqualTo("http://localhost:18384");
    }

    @Test
    void returnsCanonicalOwnershipViewsSortedByNameWithManagedAppsOnlyMarkedInstalled() {
        InstalledAppRepository installedRepository = installedRepository();
        installedRepository.save(new InstalledApp(
                "vaultwarden",
                "Family Passwords",
                "Ready",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autarkos_current_vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z")));
        installedRepository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "current-instance",
                "runtime-hash",
                "installed",
                "owned",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));
        installedRepository.save(new InstalledApp(
                "jellyfin",
                "Other Jellyfin",
                "Ready",
                runtimeRoot.resolve("apps/jellyfin").toString(),
                "autarkos_other_jellyfin",
                "http://localhost:8096",
                Instant.parse("2026-06-21T12:00:00Z")));
        installedRepository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "jellyfin",
                "appinst_jellyfin",
                "jellyfin",
                "other-instance",
                "other-hash",
                "installed",
                "owned",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));

        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:found_jellyfin", "jellyfin", "foreign_autark_os", "observed"));
        observedRepository.upsert(observed("docker:found_homepage", "homepage", "legacy_autark_os", "observed"));
        observedRepository.upsert(observed("docker:found_actual-budget", "actual-budget", "unknown_conflict", "observed"));

        List<ApplicationView> views = service(installedRepository, observedRepository).apps();

        assertThat(views).isSortedAccordingTo((left, right) -> String.CASE_INSENSITIVE_ORDER.compare(left.name(), right.name()));
        assertThat(views).filteredOn(view -> view.id().equals("vaultwarden"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.MANAGED);
                    assertThat(view.relationshipLabel()).isEqualTo("Installed");
                    assertThat(view.statusTone()).isEqualTo("success");
                    assertThat(view.cardTone()).isEqualTo("success");
                    assertThat(view.managed()).isTrue();
                    assertThat(view.installCopyWarningRequired()).isFalse();
                    assertThat(view.primaryAction()).isEqualTo(new ApplicationAction("manage", "Manage", "route", "/apps?focus=managed%3Avaultwarden&panel=manage", null, false, ""));
                    assertThat(view.appInstanceId()).isEmpty();
                    assertThat(view.evidence()).isNull();
                });
        assertThat(views).filteredOn(view -> view.id().equals("jellyfin"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.RECOVERY_REQUIRED);
                    assertThat(view.managed()).isFalse();
                    assertThat(view.installCopyWarningRequired()).isFalse();
                    assertThat(view.reviewExistingHref()).isEqualTo("/apps/found?service=docker%3Afound_jellyfin");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("review_existing", "unavailable");
                    assertThat(view.runtime()).isNull();
                    assertThat(view.evidence()).isNotNull();
                });
        assertThat(views).filteredOn(view -> view.id().equals("homepage"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.RECOVERY_REQUIRED);
                    assertThat(view.relationshipLabel()).isEqualTo("Recoverable");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.installCopyWarningRequired()).isTrue();
                });
        assertThat(views).filteredOn(view -> view.id().equals("actual-budget"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
                    assertThat(view.statusTone()).isEqualTo("danger");
                    assertThat(view.managed()).isFalse();
                });
    }

    @Test
    void retiredPinnedRecordIsClassifiedAsFoundAndNeverLooksInstalled() {
        ObservedServiceRepository observedRepository = observedRepository();
        ObservedService pinned = observed("manual:jellyfin", "jellyfin", "external", "pinned");
        observedRepository.upsert(pinned);
        observedRepository.upsert(observed("docker:jellyfin", "jellyfin", "external_docker", "observed"));

        ApplicationView view = service(installedRepository(), observedRepository).app("jellyfin").orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.statusTone()).isEqualTo("danger");
        assertThat(view.cardTone()).isEqualTo("danger");
        assertThat(view.managed()).isFalse();
        assertThat(view.installCopyWarningRequired()).isTrue();
        assertThat(view.primaryAction()).isEqualTo(new ApplicationAction("review_existing", "Review existing service", "route", "/apps/found?service=manual%3Ajellyfin", null, false, ""));
        assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("open", "review_existing", "unavailable");
        assertThat(view.evidence()).isNotNull();
        assertThat(view.evidence().id()).isEqualTo(pinned.id());
    }

    @Test
    void observedServiceWithoutCatalogAppIdCanStillMatchByName() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(new ObservedService(
                "manual:vaultwarden",
                "manual_url",
                "http://localhost:8081",
                "homelab-vaultwarden",
                "http://localhost:8081",
                "External",
                "LAN",
                null,
                "unknown",
                "external",
                "pinned",
                "unknown",
                true,
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                null,
                "{}"));

        ApplicationView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.managed()).isFalse();
        assertThat(view.evidence()).isNotNull();
        assertThat(view.primaryAction().href()).isEqualTo("/apps/found?service=manual%3Avaultwarden");
    }

    @Test
    void unpinnedObservedServiceIsFoundOnServerNotAvailable() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));

        ApplicationView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.cardTone()).isEqualTo("danger");
        assertThat(view.installCopyWarningRequired()).isTrue();
        assertThat(view.reviewExistingHref()).isEqualTo("/apps/found?service=docker%3Avaultwarden");
    }

    @Test
    void failedInstallObservedServiceIsVisibleWithoutBlockingDeliberateInstall() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("autark-os-install:vaultwarden", "vaultwarden", "failed_install", "observed"));

        ApplicationView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.statusTone()).isEqualTo("danger");
        assertThat(view.installCopyWarningRequired()).isTrue();
        assertThat(view.primaryAction().id()).isEqualTo("review_existing");
        assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("review_existing", "unavailable");
        assertThat(view.evidence()).isNotNull();
        assertThat(view.evidence().userStatus()).isEqualTo("failed_install");
        assertThat(view.evidence().userStatusLabel()).isEqualTo("Install failed");
    }

    @Test
    void ownershipProjectionReadsCachedObservedServicesWithoutScanningHost() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("manual:vaultwarden", "vaultwarden", "external", "pinned"));
        CountingObservedServiceService observedServiceService = new CountingObservedServiceService(observedRepository);
        ApplicationInventoryService service = new ApplicationInventoryService(
                catalogService(),
                installedRepository(),
                observedServiceService,
                dockerOwnershipService());

        ApplicationView view = service.app("vaultwarden").orElseThrow();
        List<ApplicationView> views = service.apps();

        assertThat(observedServiceService.refreshCalls).hasValue(0);
        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(views).filteredOn(item -> item.id().equals("vaultwarden"))
                .singleElement()
                .satisfies(item -> assertThat(item.relationship()).isEqualTo(ApplicationRelationship.BLOCKED));
    }

    @Test
    void legacyInstalledMetadataDoesNotCountAsCurrentInstanceInstalled() {
        InstalledAppRepository repository = installedRepository();
        repository.save(new InstalledApp(
                "homepage",
                "Homepage",
                "Ready",
                runtimeRoot.resolve("apps/homepage").toString(),
                "autark-os-homepage",
                "http://localhost:3000",
                Instant.parse("2026-06-21T12:00:00Z")));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "homepage",
                "appinst_homepage",
                "homepage",
                "",
                runtimeRoot.resolve("apps/homepage").toString(),
                "legacy_unscoped",
                "legacy_unscoped",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));

        ApplicationView view = service(repository, observedRepository()).app("homepage").orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.AVAILABLE);
        assertThat(view.managed()).isFalse();
        assertThat(view.runtime()).isNull();
    }

    private ApplicationInventoryService service(InstalledAppRepository installedRepository, ObservedServiceRepository observedRepository) {
        return new ApplicationInventoryService(
                catalogService(),
                installedRepository,
                observedService(observedRepository),
                dockerOwnershipService());
    }

    private MarketplaceCatalogService catalogService() {
        return new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
    }

    private InstalledAppRepository installedRepository() {
        return JpaTestRepositories.installedAppRepository(runtimeLayout());
    }

    private ObservedServiceRepository observedRepository() {
        return JpaTestRepositories.observedServiceRepository(runtimeLayout());
    }

    private ObservedServiceService observedService(ObservedServiceRepository repository) {
        return new ObservedServiceService(repository, new ObservedServiceScanner(List::of, () -> new AutarkOsIdentity("current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1)));
    }

    private DockerOwnershipService dockerOwnershipService() {
        return new DockerOwnershipService(
                () -> new AutarkOsIdentity("current-instance", "autark-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> "0.2.0",
                false);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private ObservedService observed(String id, String catalogAppId, String ownershipState, String visibility) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id,
                id.startsWith("manual:") ? "manual_url" : "docker",
                id.replaceFirst("^[^:]+:", ""),
                catalogAppId,
                id.startsWith("manual:") ? "http://localhost:8080" : null,
                "External",
                "LAN",
                catalogAppId,
                "user",
                ownershipState,
                visibility,
                "running",
                false,
                "foreign_autark_os".equals(ownershipState) ? "other-instance" : "",
                seenAt,
                seenAt,
                "pinned".equals(visibility) ? seenAt : null,
                null,
                "{}");
    }

    private static final class CountingObservedServiceService extends ObservedServiceService {
        private final AtomicInteger refreshCalls = new AtomicInteger();

        private CountingObservedServiceService(ObservedServiceRepository repository) {
            super(repository, null);
        }

        @Override
        public List<ObservedServiceView> refresh() {
            refreshCalls.incrementAndGet();
            return super.list(true);
        }
    }
}
