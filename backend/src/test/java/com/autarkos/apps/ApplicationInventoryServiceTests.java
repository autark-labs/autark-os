package com.autarkos.apps;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceRepository;
import com.autarkos.host.ObservedServiceScanner;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.apps.recovery.AppRecoveryService;
import com.autarkos.apps.recovery.AppRecoveryModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.testsupport.ManagedAppTestContract;

class ApplicationInventoryServiceTests {

    @Test
    void activeInstallIsNotOfferedAsRecoveryBeforeRegistrationExists() {
        var repository = installedRepository();
        var recovery = recovery();
        var inventory = new ApplicationInventoryService(catalogService(), repository, managedApps(repository), recovery);
        var evidence = List.of(observed("docker:syncthing", "syncthing", "owned_managed", "observed"));
        var operation = com.autarkos.api.AppOperationView.running("installing", "Installing", "install-1", "Starting services", "Starting services");

        var view = inventory.apps(evidence, List.of(), Map.of("syncthing", operation)).stream()
                .filter(app -> app.id().equals("syncthing")).findFirst().orElseThrow();

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.AVAILABLE);
        assertThat(view.relationshipLabel()).isEqualTo("Installing");
        assertThat(view.operation()).isEqualTo(operation);
        assertThat(view.primaryAction().disabled()).isTrue();
        assertThat(view.availableActions()).extracting(ApplicationAction::id).doesNotContain("recover", "review_setup");
        assertThat(view.evidence()).isNull();
        org.mockito.Mockito.verify(recovery, org.mockito.Mockito.never()).applicablePlan(eq("syncthing"), anyList());

        // Once the job ends, genuine incomplete registrations must still be reviewed.
        var finished = inventory.apps(evidence, List.of(), Map.of()).stream()
                .filter(app -> app.id().equals("syncthing")).findFirst().orElseThrow();
        assertThat(finished.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        org.mockito.Mockito.verify(recovery).applicablePlan(eq("syncthing"), anyList());
    }

    @TempDir
    Path runtimeRoot;

    @Test
    void discoverOpenUsesTheSameVerifiedPrivateLinkAsManagedAppViews() throws Exception {
        var repository = installedRepository();
        writeManagedCompose("syncthing");
        repository.save(new InstalledApp("syncthing", "Syncthing", "Ready", runtimeRoot.resolve("apps/syncthing").toString(),
                "autarkos_autark-os_syncthing", "http://localhost:18384", Instant.now()));
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "syncthing", "instance", "syncthing", "current-instance", runtimeRoot.resolve("apps/syncthing").toString(),
                "installed", "owned", Instant.now(), Instant.now()));
        String privateUrl = "https://server.example.ts.net:14384";
        var service = new ApplicationInventoryService(catalogService(), repository, managedApps(repository), recovery());
        var view = service.apps(List.of(), List.of(runtime("syncthing", "Syncthing", privateUrl)), Map.of())
                .stream().filter(application -> application.id().equals("syncthing")).findFirst().orElseThrow();
        assertThat(view.runtime().accessRoute().privateLinkStatus()).isEqualTo("verified");
        assertThat(view.availableActions()).contains(new ApplicationAction("open", "Open", "external", privateUrl, null, false, ""));
        assertThat(view.availableActions()).contains(new ApplicationAction("backup", "Create backup", "action", "/api/backups/apps/syncthing/run", "POST", false, ""));
        assertThat(repository.findAppById("syncthing").orElseThrow().accessUrl()).isEqualTo("http://localhost:18384");

        var stopped = service.apps(List.of(), List.of(runtime("syncthing", "Syncthing", privateUrl, ApplicationRuntimeState.STOPPED)), Map.of())
                .stream().filter(application -> application.id().equals("syncthing")).findFirst().orElseThrow();
        assertThat(stopped.availableActions()).extracting(ApplicationAction::id).doesNotContain("open", "stop").contains("start");
        assertThat(stopped.availableActions()).contains(new ApplicationAction("start", "Start", "action", "/api/apps/syncthing/start", "POST", false, ""));

        var busy = service.apps(List.of(), List.of(runtime("syncthing", "Syncthing", privateUrl)),
                Map.of("syncthing", com.autarkos.api.AppOperationView.running("backing_up", "Creating backup", "backup-1", "Copying data", "Copying data")))
                .stream().filter(application -> application.id().equals("syncthing")).findFirst().orElseThrow();
        assertThat(busy.availableActions()).isEmpty();
    }

    @Test
    void composeLossAfterAttestationDisablesSettingsWithTheActualPutContract() throws Exception {
        var repository = installedRepository();
        var installed = new InstalledApp("syncthing", "Syncthing", "Ready", runtimeRoot.resolve("apps/syncthing").toString(),
                "autarkos_autark-os_syncthing", "http://localhost:18384", Instant.now());
        repository.save(installed);
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "syncthing", "instance", "syncthing", "current-instance", installed.runtimePath(),
                "installed", "owned", Instant.now(), Instant.now()));
        var attestation = managedApps(repository);
        var result = attestation.attest(repository.findAppById("syncthing").orElseThrow());
        assertThat(result.managed()).isTrue();
        var snapshot = mock(ManagedAppAttestationService.class);
        when(snapshot.attest(org.mockito.ArgumentMatchers.<InstalledApp>any())).thenAnswer(invocation ->
                invocation.getArgument(0) == null ? attestation.attest((InstalledApp) null) : result);
        Files.delete(runtimeRoot.resolve("apps/syncthing/compose.yaml"));
        var service = new ApplicationInventoryService(catalogService(), repository, snapshot, recovery());
        var view = service.apps(List.of(), List.of(runtime("syncthing", "Syncthing", "http://localhost:18384")), Map.of())
                .stream().filter(application -> application.id().equals("syncthing")).findFirst().orElseThrow();
        assertThat(view.availableActions()).filteredOn(action -> action.id().equals("settings")).singleElement().satisfies(action -> {
            assertThat(action.kind()).isEqualTo("action");
            assertThat(action.method()).isEqualTo("PUT");
            assertThat(action.href()).isEqualTo("/api/apps/syncthing/settings");
            assertThat(action.disabled()).isTrue();
            assertThat(action.reason()).contains("Compose file is missing");
        });
        assertThat(view.availableActions()).filteredOn(action -> List.of("backup", "restart").contains(action.id()))
                .allSatisfy(action -> assertThat(action.disabled()).isTrue());
        assertThat(attestation.attest(installed).managed()).isFalse();
    }

    @Test
    void returnsCanonicalOwnershipViewsSortedByNameWithManagedAppsOnlyMarkedInstalled() throws Exception {
        InstalledAppRepository installedRepository = installedRepository();
        writeManagedCompose("vaultwarden");
        installedRepository.save(new InstalledApp(
                "vaultwarden",
                "Family Passwords",
                "Ready",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autarkos_autark-os_vaultwarden",
                "http://localhost:8090",
                Instant.parse("2026-06-21T12:00:00Z")));
        installedRepository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "current-instance",
                runtimeRoot.resolve("apps/vaultwarden").toString(),
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

        List<ApplicationView> views = service(installedRepository, observedRepository).apps(
                observedService(observedRepository).observedServices(),
                List.of(runtime("vaultwarden", "Family Passwords", "http://localhost:8090")), Map.of());

        assertThat(views).isSortedAccordingTo((left, right) -> String.CASE_INSENSITIVE_ORDER.compare(left.name(), right.name()));
        assertThat(views).filteredOn(view -> view.id().equals("vaultwarden"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.MANAGED);
                    assertThat(view.relationshipLabel()).isEqualTo("Installed");
                    assertThat(view.statusTone()).isEqualTo("success");
                    assertThat(view.cardTone()).isEqualTo("success");
                    assertThat(view.managed()).isTrue();
                    assertThat(view.primaryAction()).isEqualTo(new ApplicationAction("manage", "Manage", "route", "/apps?focus=managed%3Avaultwarden&panel=manage", null, false, ""));
                    assertThat(view.appInstanceId()).isEqualTo("appinst_vaultwarden");
                    assertThat(view.runtime()).isNotNull();
                    assertThat(view.evidence()).isNull();
                });
        assertThat(views).filteredOn(view -> view.id().equals("jellyfin"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
                    assertThat(view.managed()).isFalse();
                    assertThat(view.primaryAction().href()).isEqualTo("/apps?review=jellyfin");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.availableActions()).extracting(ApplicationAction::id).containsExactly("review_existing");
                    assertThat(view.runtime()).isNull();
                    assertThat(view.evidence()).isNotNull();
                });
        assertThat(views).filteredOn(view -> view.id().equals("homepage"))
                .singleElement()
                .satisfies(view -> {
                    assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
                    assertThat(view.relationshipLabel()).isEqualTo("Blocked");
                    assertThat(view.primaryAction().id()).isEqualTo("review_existing");
                    assertThat(view.availableActions()).extracting(ApplicationAction::id).containsExactly("review_existing");
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
    void retiredPinnedRecordStaysDormantWhileCurrentDockerEvidenceBlocksInstall() {
        ObservedServiceRepository observedRepository = observedRepository();
        ObservedService pinned = observed("manual:jellyfin", "jellyfin", "external", "pinned");
        observedRepository.upsert(pinned);
        observedRepository.upsert(observed("docker:jellyfin", "jellyfin", "external_docker", "observed"));

        ApplicationView view = app(service(installedRepository(), observedRepository), observedRepository, "jellyfin");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.statusTone()).isEqualTo("danger");
        assertThat(view.cardTone()).isEqualTo("danger");
        assertThat(view.managed()).isFalse();
        assertThat(view.primaryAction()).isEqualTo(new ApplicationAction("review_existing", "Review existing service", "route", "/apps?review=jellyfin", null, false, ""));
        assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("review_existing", "unavailable");
        assertThat(view.evidence()).isNotNull();
        assertThat(view.evidence().resourceId()).isEqualTo("docker:jellyfin");
    }

    @Test
    void retiredManualLinkWithoutCatalogAppIdDoesNotEnterApplicationState() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(new ObservedService(
                "manual:vaultwarden",
                "manual_url",
                "http://localhost:8081",
                "homelab-vaultwarden",
                "http://localhost:8081",
                "LAN",
                null,
                "unknown",
                "external",
                "unknown",
                "",
                Instant.parse("2026-06-21T12:00:00Z"),
                Instant.parse("2026-06-21T12:00:00Z"),
                "{}"));

        ApplicationView view = app(service(installedRepository(), observedRepository), observedRepository, "vaultwarden");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.AVAILABLE);
        assertThat(view.managed()).isFalse();
        assertThat(view.evidence()).isNull();
    }

    @Test
    void inferredCatalogHintDoesNotBlockInstall() {
        ObservedServiceRepository observedRepository = observedRepository();
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        observedRepository.upsert(new ObservedService(
                "docker:vaultwarden-helper", "docker", "vaultwarden-helper", "vaultwarden-helper",
                "http://localhost:8081", "LAN", "vaultwarden", "inferred", "external_docker", "running", "",
                seenAt, seenAt, "{}"));

        ApplicationView view = app(service(installedRepository(), observedRepository), observedRepository, "vaultwarden");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.AVAILABLE);
        assertThat(view.evidence()).isNull();
    }

    @Test
    void externalDockerEvidenceBlocksInstall() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("docker:vaultwarden", "vaultwarden", "external_docker", "observed"));

        ApplicationView view = app(service(installedRepository(), observedRepository), observedRepository, "vaultwarden");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.cardTone()).isEqualTo("danger");
        assertThat(view.primaryAction().href()).isEqualTo("/apps?review=vaultwarden");
    }

    @Test
    void recoveryRelationshipRequiresAnApplicablePreflightPlan() {
        InstalledAppRepository repository = installedRepository();
        ObservedServiceRepository observed = observedRepository();
        observed.upsert(observed("docker:vaultwarden", "vaultwarden", "owned_managed", "observed"));
        AppRecoveryService recovery = recovery();
        when(recovery.applicablePlan(eq("vaultwarden"), anyList())).thenReturn(Optional.of(new AppRecoveryModels.RecoveryPlan(
                "vaultwarden", "Vaultwarden", "current_instance_registration_lost", true,
                "Registration can be restored.", "recovery-plan", runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autarkos_autark-os_vaultwarden", "appinst_vaultwarden", List.of("vaultwarden"), List.of(), List.of(),
                List.of(), List.of("Restore registration"), List.of())));
        ApplicationInventoryService inventory = new ApplicationInventoryService(
                catalogService(), repository, managedApps(repository), recovery);

        ApplicationView view = app(inventory, observed, "vaultwarden");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.RECOVERY_REQUIRED);
        assertThat(view.primaryAction().id()).isEqualTo("recover");
        assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("recover");
    }

    @Test
    void failedInstallEvidenceBlocksInstallWithoutBecomingManaged() {
        ObservedServiceRepository observedRepository = observedRepository();
        observedRepository.upsert(observed("autark-os-install:vaultwarden", "vaultwarden", "failed_install", "observed"));

        ApplicationView view = app(service(installedRepository(), observedRepository), observedRepository, "vaultwarden");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipLabel()).isEqualTo("Blocked");
        assertThat(view.statusTone()).isEqualTo("danger");
        assertThat(view.primaryAction().id()).isEqualTo("review_existing");
        assertThat(view.availableActions()).extracting(ApplicationAction::id).contains("review_existing", "unavailable");
        assertThat(view.evidence()).isNotNull();
        assertThat(view.evidence().ownershipState()).isEqualTo("failed_install");
        assertThat(view.evidence().statusLabel()).isEqualTo("Install failed");
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

        ObservedServiceRepository observed = observedRepository();
        ApplicationView view = app(service(repository, observed), observed, "homepage");

        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.managed()).isFalse();
        assertThat(view.runtime()).isNull();
    }

    @Test
    void inventoryAndMutationAuthorizationRejectTheSameIncompleteManagedContract() throws Exception {
        InstalledAppRepository repository = installedRepository();
        InstalledApp app = new InstalledApp(
                "vaultwarden", "Vaultwarden", "Ready", runtimeRoot.resolve("apps/vaultwarden").toString(),
                "autarkos_autark-os_vaultwarden", "http://localhost:8090", Instant.now());
        repository.save(app);
        repository.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata(
                "vaultwarden", "appinst_vaultwarden", "vaultwarden", "current-instance",
                app.runtimePath(), "ready", "owned", Instant.now(), Instant.now()));
        ManagedAppAttestationService managedApps = managedApps(repository);
        Files.delete(runtimeRoot.resolve("apps/vaultwarden/manifest.yaml"));
        ApplicationInventoryService inventory = new ApplicationInventoryService(
                catalogService(), repository, managedApps, recovery());
        ObservedService currentRuntime = observed(
                "docker:vaultwarden", "vaultwarden", "owned_managed", "observed");

        ApplicationView view = inventory.apps(List.of(currentRuntime), List.of(), Map.of()).stream()
                .filter(candidate -> candidate.id().equals("vaultwarden")).findFirst().orElseThrow();
        assertThat(view.relationship()).isEqualTo(ApplicationRelationship.BLOCKED);
        assertThat(view.relationshipDescription()).contains("saved app release manifest is missing");
        assertThat(view.evidence().statusLabel()).isEqualTo("Management incomplete");
        assertThat(view.evidence().summary()).contains("saved app release manifest is missing");
        assertThat(view.evidence().summary()).doesNotContain("registration is missing");
        assertThat(org.assertj.core.api.Assertions.catchThrowable(
                () -> managedApps.requireManaged("vaultwarden", "start")))
                .isInstanceOf(com.autarkos.marketplace.install.InstallationException.class)
                .hasMessageContaining("saved app release manifest is missing");
    }

    private ApplicationInventoryService service(InstalledAppRepository installedRepository, ObservedServiceRepository observedRepository) {
        return new ApplicationInventoryService(
                catalogService(),
                installedRepository,
                managedApps(installedRepository),
                recovery());
    }

    private AppRecoveryService recovery() {
        return mock(AppRecoveryService.class);
    }

    private ApplicationView app(ApplicationInventoryService service, ObservedServiceRepository observed, String appId) {
        return service.apps(observedService(observed).observedServices(), List.of(), Map.of()).stream()
                .filter(view -> view.id().equals(appId)).findFirst().orElseThrow();
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
        return new ObservedServiceService(repository, new ObservedServiceScanner());
    }

    private ManagedAppAttestationService managedApps(InstalledAppRepository repository) {
        AutarkOsIdentity identity = new AutarkOsIdentity("current-instance", "autark-os", runtimeRoot.toString(),
                "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1);
        ManagedAppTestContract.writeAll(repository, runtimeLayout(), identity);
        return ManagedAppTestContract.service(repository, runtimeLayout(), identity);
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private void writeManagedCompose(String appId) throws Exception {
        Path appDirectory = runtimeRoot.resolve("apps").resolve(appId);
        Files.createDirectories(appDirectory);
        Files.writeString(appDirectory.resolve("compose.yaml"), "services: {}\n");
    }

    private AppRuntimeView runtime(String appId, String name, String accessUrl) {
        return runtime(appId, name, accessUrl, ApplicationRuntimeState.READY);
    }

    private AppRuntimeView runtime(String appId, String name, String accessUrl, ApplicationRuntimeState state) {
        return new AppRuntimeView(
                appId, name, "Apps", name + " app", "1.0.0", "", state,
                runtimeRoot.resolve("apps").resolve(appId).toString(), "autark-os-" + appId, accessUrl,
                new com.autarkos.marketplace.install.models.AccessModels.AppAccessRoute(
                        accessUrl, "http://localhost:18384", accessUrl.startsWith("https") ? accessUrl : null,
                        null, "http", null, null, accessUrl.startsWith("https") ? "verified" : "not_enabled", "network"),
                null, null, Instant.parse("2026-06-21T12:00:00Z"), "Backups disabled", "backup_disabled",
                null, null, null, null, null, List.of(), null, List.of());
    }

    private ObservedService observed(String id, String catalogAppId, String ownershipState, String visibility) {
        Instant seenAt = Instant.parse("2026-06-21T12:00:00Z");
        return new ObservedService(
                id,
                id.startsWith("manual:") ? "manual_url" : id.startsWith("autark-os-install:") ? "autark_os_install" : "docker",
                id.replaceFirst("^[^:]+:", ""),
                catalogAppId,
                id.startsWith("manual:") ? "http://localhost:8080" : null,
                "LAN",
                catalogAppId,
                "user",
                ownershipState,
                "running",
                "foreign_autark_os".equals(ownershipState) ? "other-instance" : "",
                seenAt,
                seenAt,
                "{}");
    }

}
