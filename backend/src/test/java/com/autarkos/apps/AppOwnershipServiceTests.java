package com.autarkos.apps;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.discover.DiscoverInstalledAppSummary;
import com.autarkos.backups.BackupRepository;
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
import com.autarkos.marketplace.install.InstalledAppOwnershipMetadata;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.RestorePointTestRecords;
import com.autarkos.system.AutarkOsIdentity;

class AppOwnershipServiceTests {

    @TempDir
    Path runtimeRoot;

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
        installedRepository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
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
        installedRepository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
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

        List<AppOwnershipView> views = service(installedRepository, observedRepository).apps();

        assertThat(views).isSortedAccordingTo((left, right) -> String.CASE_INSENSITIVE_ORDER.compare(left.name(), right.name()));
        assertThat(views).filteredOn(view -> view.catalogAppId().equals("vaultwarden"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.state()).isEqualTo(AppOwnershipState.INSTALLED_MANAGED);
                    assertThat(view.stateLabel()).isEqualTo("Installed");
                    assertThat(view.statusTone()).isEqualTo("success");
                    assertThat(view.cardTone()).isEqualTo("success");
                    assertThat(view.installed()).isTrue();
                    assertThat(view.ownedByCurrentInstance()).isTrue();
                    assertThat(view.installCopyWarningRequired()).isFalse();
                    assertThat(view.primaryAction()).isEqualTo(new AppOwnershipAction("manage", "Manage", "route", "/apps?focus=managed%3Avaultwarden&panel=manage", null, false, ""));
                    assertThat(view.installedApp()).isEqualTo(new DiscoverInstalledAppSummary("vaultwarden", "Family Passwords", "Ready", "http://localhost:8090"));
                    assertThat(view.observedService()).isNull();
                });
        assertThat(views).filteredOn(view -> view.catalogAppId().equals("jellyfin"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.state()).isEqualTo(AppOwnershipState.MANAGED_ELSEWHERE);
                    assertThat(view.installed()).isFalse();
                    assertThat(view.ownedByCurrentInstance()).isFalse();
                    assertThat(view.installCopyWarningRequired()).isTrue();
                    assertThat(view.reviewExistingHref()).isEqualTo("/apps?focus=service%3Adocker%3Afound_jellyfin&panel=manage");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.availableActions()).extracting(AppOwnershipAction::id).contains("review_existing", "install_copy");
                    assertThat(view.installedApp()).isNull();
                    assertThat(view.observedService()).isNotNull();
                });
        assertThat(views).filteredOn(view -> view.catalogAppId().equals("homepage"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.state()).isEqualTo(AppOwnershipState.RECOVERABLE);
                    assertThat(view.stateLabel()).isEqualTo("Recoverable");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.installCopyWarningRequired()).isTrue();
                });
        assertThat(views).filteredOn(view -> view.catalogAppId().equals("actual-budget"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.state()).isEqualTo(AppOwnershipState.BLOCKED);
                    assertThat(view.statusTone()).isEqualTo("danger");
                    assertThat(view.installed()).isFalse();
                });
    }

    @Test
    void pinnedObservedServiceWinsBeforeFoundOnServerAndNeverLooksInstalled() {
        ObservedServiceRepository observedRepository = observedRepository();
        ObservedService pinned = observed("manual:jellyfin", "jellyfin", "external", "pinned");
        observedRepository.upsert(pinned);
        observedRepository.upsert(observed("docker:jellyfin", "jellyfin", "external_docker", "observed"));

        AppOwnershipView view = service(installedRepository(), observedRepository).app("jellyfin").orElseThrow();

        assertThat(view.state()).isEqualTo(AppOwnershipState.PINNED_EXTERNAL);
        assertThat(view.stateLabel()).isEqualTo("Pinned");
        assertThat(view.statusTone()).isEqualTo("info");
        assertThat(view.cardTone()).isEqualTo("info");
        assertThat(view.installed()).isFalse();
        assertThat(view.ownedByCurrentInstance()).isFalse();
        assertThat(view.installCopyWarningRequired()).isTrue();
        assertThat(view.primaryAction()).isEqualTo(new AppOwnershipAction("review_existing", "Review existing service", "route", "/apps?focus=service%3Amanual%3Ajellyfin&panel=manage", null, false, ""));
        assertThat(view.availableActions()).extracting(AppOwnershipAction::id).contains("open", "review_existing", "install_copy");
        assertThat(view.observedService()).isNotNull();
        assertThat(view.observedService().id()).isEqualTo(pinned.id());
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

        AppOwnershipView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.state()).isEqualTo(AppOwnershipState.PINNED_EXTERNAL);
        assertThat(view.installed()).isFalse();
        assertThat(view.observedService()).isNotNull();
        assertThat(view.primaryAction().href()).isEqualTo("/apps?focus=service%3Amanual%3Avaultwarden&panel=manage");
    }

    @Test
    void unpinnedObservedServiceIsFoundOnServerNotAvailable() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));

        AppOwnershipView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.state()).isEqualTo(AppOwnershipState.FOUND_ON_SERVER);
        assertThat(view.stateLabel()).isEqualTo("Found on server");
        assertThat(view.cardTone()).isEqualTo("observed");
        assertThat(view.installCopyWarningRequired()).isTrue();
        assertThat(view.reviewExistingHref()).isEqualTo("/apps?focus=service%3Adocker%3Avaultwarden&panel=manage");
    }

    @Test
    void failedInstallObservedServiceIsVisibleWithoutBlockingDeliberateInstall() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("autark-os-install:vaultwarden", "vaultwarden", "failed_install", "observed"));

        AppOwnershipView view = service(installedRepository(), observedRepository).app("vaultwarden").orElseThrow();

        assertThat(view.state()).isEqualTo(AppOwnershipState.FAILED_INSTALL);
        assertThat(view.stateLabel()).isEqualTo("Install failed");
        assertThat(view.statusTone()).isEqualTo("warning");
        assertThat(view.installCopyWarningRequired()).isFalse();
        assertThat(view.primaryAction()).isEqualTo(new AppOwnershipAction("review_setup", "Review setup", "route", "/discover?app=vaultwarden", null, false, ""));
        assertThat(view.availableActions()).extracting(AppOwnershipAction::id).containsExactly("review_setup");
        assertThat(view.observedService()).isNotNull();
        assertThat(view.observedService().userStatus()).isEqualTo("failed_install");
        assertThat(view.observedService().userStatusLabel()).isEqualTo("Install failed");
    }

    @Test
    void installedSummaryReportsCanonicalBackupProtectionFromCompletedRestorePoints() {
        InstalledAppRepository repository = installedRepository();
        InstalledApp vaultwarden = new InstalledApp(
                "vaultwarden",
                "Family Passwords",
                "Ready",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autark-os-vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z"));
        repository.save(vaultwarden);
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "current-instance",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "installed",
                "owned",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));
        BackupRepository backupRepository = JpaTestRepositories.backupRepository(runtimeLayout());
        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Family Passwords", "app", "manual", "vaultwarden", "/backups/vaultwarden-failed.zip", "failed", 0, "Backup failed.");

        DiscoverInstalledAppSummary unprotected = service(repository, observedRepository(), backupRepository)
                .app("vaultwarden")
                .orElseThrow()
                .installedApp();

        assertThat(unprotected.backupState()).isEqualTo("backup_enabled_no_restore_point");
        assertThat(unprotected.protectedByBackups()).isFalse();
        assertThat(unprotected.firstBackupRecommended()).isTrue();

        RestorePointTestRecords.record(backupRepository, "vaultwarden", "Family Passwords", "app", "manual", "vaultwarden", "/backups/vaultwarden.zip", "completed", 1024, "Backup completed.");

        DiscoverInstalledAppSummary protectedApp = service(repository, observedRepository(), backupRepository)
                .app("vaultwarden")
                .orElseThrow()
                .installedApp();

        assertThat(protectedApp.backupState()).isEqualTo("protected_by_restore_point");
        assertThat(protectedApp.protectedByBackups()).isTrue();
        assertThat(protectedApp.firstBackupRecommended()).isFalse();
    }

    @Test
    void ownershipProjectionReadsCachedObservedServicesWithoutScanningHost() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("manual:vaultwarden", "vaultwarden", "external", "pinned"));
        CountingObservedServiceService observedServiceService = new CountingObservedServiceService(observedRepository);
        AppOwnershipService service = new AppOwnershipService(
                catalogService(),
                installedRepository(),
                observedServiceService,
                dockerOwnershipService(),
                JpaTestRepositories.backupRepository(runtimeLayout()));

        AppOwnershipView view = service.app("vaultwarden").orElseThrow();
        List<AppOwnershipView> views = service.apps();

        assertThat(observedServiceService.refreshCalls).hasValue(0);
        assertThat(view.state()).isEqualTo(AppOwnershipState.PINNED_EXTERNAL);
        assertThat(views).filteredOn(item -> item.catalogAppId().equals("vaultwarden"))
                .singleElement()
                .satisfies(item -> assertThat(item.state()).isEqualTo(AppOwnershipState.PINNED_EXTERNAL));
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
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "homepage",
                "appinst_homepage",
                "homepage",
                "",
                runtimeRoot.resolve("apps/homepage").toString(),
                "legacy_unscoped",
                "legacy_unscoped",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z")));

        AppOwnershipView view = service(repository, observedRepository()).app("homepage").orElseThrow();

        assertThat(view.state()).isEqualTo(AppOwnershipState.AVAILABLE);
        assertThat(view.installed()).isFalse();
        assertThat(view.ownedByCurrentInstance()).isFalse();
        assertThat(view.installedApp()).isNull();
    }

    private AppOwnershipService service(InstalledAppRepository installedRepository, ObservedServiceRepository observedRepository) {
        return service(installedRepository, observedRepository, JpaTestRepositories.backupRepository(runtimeLayout()));
    }

    private AppOwnershipService service(InstalledAppRepository installedRepository, ObservedServiceRepository observedRepository, BackupRepository backupRepository) {
        return new AppOwnershipService(
                catalogService(),
                installedRepository,
                observedService(observedRepository),
                dockerOwnershipService(),
                backupRepository);
    }

    private MarketplaceCatalogService catalogService() {
        return new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
    }

    private InstalledAppRepository installedRepository() {
        return new InstalledAppRepository(runtimeLayout());
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
