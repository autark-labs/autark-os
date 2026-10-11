package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipFile;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.fileops.AutarkOsFileOpsService;
import com.autarkos.fileops.LocalAutarkOsFileOperations;
import com.autarkos.host.DockerInventoryService;
import com.autarkos.host.HostDockerContainerDiscovery;
import com.autarkos.host.ProcessHostDockerContainerDiscovery;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppAccessChecker;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.AppRuntimeMetadataReader;
import com.autarkos.marketplace.install.AppRuntimeMetadataWriter;
import com.autarkos.marketplace.install.AppTelemetryService;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerOwnershipService;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.ManagedAppAttestationService;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.PostInstallGuideBuilder;
import com.autarkos.marketplace.install.ProcessDockerComposeExecutor;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.system.AutarkOsIdentity;
import com.autarkos.system.ProjectSettingsService;
import com.autarkos.system.RuntimeFileOperations;
import com.autarkos.system.SystemCommandRunner;
import com.autarkos.testsupport.JpaTestRepositories;

/** Opt-in real writer rehearsal; every mutation is confined to a unique temporary Compose project. */
@EnabledIfEnvironmentVariable(named = "AUTARK_BACKUP_DOCKER_REHEARSAL", matches = "1")
class BackupDockerRehearsalTests {
    @TempDir Path root;

    @Test
    void scheduledWindowCreatesOneColdVerifiedBackupAndPolicyOffStillAllowsManualBackup() throws Exception {
        try (Fixture fixture = new Fixture()) {
            fixture.startWriter();
            var settings = com.autarkos.system.ProjectSettings.defaults("test");
            JpaTestRepositories.projectSettingsRepository(fixture.layout).save(new com.autarkos.system.ProjectSettings(
                    settings.deviceName(), "UTC", settings.language(), settings.temperatureUnit(), settings.dateFormat(), settings.timeFormat(),
                    settings.startOnBoot(), settings.telemetryEnabled(), settings.defaultInstallAccess(), settings.automaticRepairEnabled(),
                    true, "hourly", 7, "00:00", Instant.now()));
            var scheduler = new BackupSchedulerService(fixture.backups, new ActivityLogService(mock(ActivityLogRepository.class)), fixture.jobs, true);
            scheduler.runDueRoutineBackup();
            scheduler.runDueRoutineBackup();
            assertThat(fixture.jobs.activeJobs()).hasSize(1);
            var queued = fixture.jobs.activeJobs().getFirst();
            fixture.jobs.runQueuedJobsNow();
            var completed = fixture.jobs.findById(queued.jobId()).orElseThrow();
            assertThat(completed.status()).isEqualTo("succeeded");
            assertThat(completed.steps()).extracting(com.autarkos.jobs.AutarkOsJobStep::id)
                    .contains("wait_for_recovery", "prepare_backup", "stop_apps", "copy_data", "verify_backup", "resume_apps");
            assertThat(completed.steps()).allMatch(step -> "succeeded".equals(step.status()));
            var point = fixture.points.recent(1).stream().map(RestorePoints::toDomain).findFirst().orElseThrow();
            assertThat(point.verificationStatus()).isEqualTo("verified");
            assertThat(archiveRecords(point)).isEqualTo(fixture.compose.lastStoppedRecords);
            fixture.assertWriterRunning();
            scheduler.runDueRoutineBackup();
            assertThat(fixture.jobs.list()).hasSize(1);
            fixture.register(false);
            assertThat(fixture.backups.run("homepage").status()).isEqualTo("completed");
            assertThat(fixture.backups.report().apps()).singleElement().satisfies(app -> assertThat(app.protectedByBackups()).isTrue());
            assertThat(fixture.installed.settingsFor("homepage").orElseThrow().backup().enabled()).isFalse();
            fixture.assertWriterRunning();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void stalePausedRegistrationStillProducesColdVerifiedRestorableData(boolean full) throws Exception {
        try (Fixture fixture = new Fixture()) {
            fixture.startWriter();
            fixture.installed.save(fixture.app("Paused"));
            RestorePoint point = full
                    ? fixture.backups.runFullBackup("manual").restorePoint()
                    : fixture.backups.run("homepage").restorePoint();

            assertThat(point.verificationStatus()).isEqualTo("verified");
            assertThat(fixture.compose.stopCalls).isEqualTo(1);
            String archived = archiveRecords(point);
            assertThat(archived).isEqualTo(fixture.compose.lastStoppedRecords);
            assertThat(archived).startsWith("known-record-one\nknown-record-two\nwriter-");
            fixture.assertWriterRunning();

            fixture.changeDataAndRestore(point, archived);
            assertThat(fixture.backups.verify(point.id()).status()).isEqualTo("verified");
        }
    }

    @Test
    void policyOffUninstallCheckpointCanRestorePopulatedWriterData() throws Exception {
        try (Fixture fixture = new Fixture()) {
            fixture.startWriter();
            fixture.register(false);
            assertThat(fixture.lifecycle.uninstall("homepage").status()).isEqualTo("removed");
            assertThat(fixture.installed.findAppById("homepage")).isEmpty();
            assertThat(fixture.compose.real.containers(fixture.composeFile, fixture.project)).isEmpty();
            RestorePoint checkpoint = fixture.points.recent(20).stream().map(RestorePoints::toDomain)
                    .filter(point -> "pre_uninstall".equals(point.source())).findFirst().orElseThrow();
            assertThat(checkpoint.verificationStatus()).isEqualTo("verified");
            assertThat(checkpoint.integrityBaselineSha256()).matches("[a-f0-9]{64}");
            String archived = archiveRecords(checkpoint);
            assertThat(archived).isEqualTo(fixture.compose.lastStoppedRecords);
            assertThat(fixture.records).hasContent(archived);

            // Retained recovery data stays discoverable independently of the recent report.
            for (int index = 0; index < 55; index++) {
                fixture.points.save(RestorePoints.create("newer-app", "Newer app", "app", "manual", "newer-app",
                        "/unrelated/archive-" + index, "completed", 1, "Newer backup", "", "cold_file", 1));
            }
            assertThat(fixture.points.recent(20)).noneMatch(row -> row.id() == checkpoint.id());
            var firstPage = fixture.backups.restorePoints(null, null);
            assertThat(firstPage.items()).hasSize(50);
            assertThat(fixture.backups.restorePoints(firstPage.nextBeforeId(), null).items())
                    .anyMatch(point -> point.id() == checkpoint.id());
            assertThat(fixture.backups.restorePoints(null, "homepage").items())
                    .anyMatch(point -> point.id() == checkpoint.id());
            assertThat(fixture.backups.restorePoint(checkpoint.id()).id()).isEqualTo(checkpoint.id());
            assertThat(fixture.backups.restorePlan(checkpoint.id(), "homepage").executable()).isFalse();

            // Restore requires a managed target. Re-register the same attested runtime and identity;
            // ownership recovery UX is covered separately, not simulated by copying archive files.
            fixture.register(false);
            Files.writeString(fixture.records, "changed-after-uninstall\n");
            assertThat(fixture.backups.restorePlan(checkpoint.id(), "homepage").executable()).isTrue();
            assertThat(fixture.backups.restore(checkpoint.id(), "homepage", fixture.backups.restorePlan(checkpoint.id(), "homepage").planId()).status()).isEqualTo("completed");
            assertThat(fixture.compose.recordsBeforeLastStart).isEqualTo(archived);
            fixture.assertWriterRunning();
            assertThat(fixture.installed.settingsFor("homepage").orElseThrow().backup().enabled()).isFalse();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void observationFailureAfterRealStopResumesWriterWithoutLosingData(boolean restore) throws Exception {
        try (Fixture fixture = new Fixture()) {
            fixture.startWriter();
            RestorePoint point = fixture.backups.run("homepage").restorePoint();
            int startsBefore = fixture.compose.startCalls;
            int stopsBefore = fixture.compose.stopCalls;
            fixture.compose.failAfterNextStop = true;

            if (restore) {
                assertThatThrownBy(() -> fixture.backups.restore(point.id(), "homepage", fixture.backups.restorePlan(point.id(), "homepage").planId()))
                        .hasMessageContaining("No app data was changed");
            } else {
                var result = fixture.backups.run("homepage");
                assertThat(result.status()).isEqualTo("failed");
                assertThat(result.message()).contains("injected inventory failure after real stop");
            }
            assertThat(fixture.compose.stopCalls).isEqualTo(stopsBefore + 1);
            assertThat(fixture.compose.startCalls).isEqualTo(startsBefore + 1);
            assertThat(fixture.compose.recordsBeforeLastStart).isEqualTo(fixture.compose.lastStoppedRecords);
            fixture.assertWriterRunning();
        }
    }

    private String archiveRecords(RestorePoint point) throws Exception {
        try (ZipFile zip = new ZipFile(point.path())) {
            String name = ("full".equals(point.scope()) ? "homepage/" : "") + "config/records.txt";
            var entry = zip.getEntry(name);
            assertThat(entry).as("archive writer data entry %s", name).isNotNull();
            return new String(zip.getInputStream(entry).readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private final class Fixture implements AutoCloseable {
        final String project = "autark-uf01-" + UUID.randomUUID().toString().substring(0, 8);
        final String appInstance = "appinst_" + project;
        final RuntimeLayout layout;
        final Path composeFile;
        final Path records;
        final String accessUrl;
        final InstalledAppRepository installed;
        final BackupRepository points;
        final ObservedCompose compose;
        final AppLifecycleService lifecycle;
        final BackupService backups;
        final AutarkOsJobService jobs;
        final AutarkOsIdentity identity;

        Fixture() throws Exception {
            var properties = new AutarkOsRuntimeProperties();
            properties.setRuntimeRoot(root.toString());
            layout = new RuntimeLayout(properties);
            composeFile = layout.appRoot("homepage").resolve("compose.yaml");
            records = layout.appRoot("homepage").resolve("config/records.txt");
            Files.createDirectories(records.getParent());
            Files.writeString(records, "known-record-one\nknown-record-two\n");
            Files.writeString(records.resolveSibling("index.html"), "UF-01 disposable writer\n");
            int port;
            try (var socket = new java.net.ServerSocket(0)) { port = socket.getLocalPort(); }
            accessUrl = "http://127.0.0.1:" + port;
            identity = new AutarkOsIdentity("pos_" + project, project, root.toString(), project, Instant.now(), 1);
            var ownership = new DockerOwnershipService(() -> identity, () -> "test", false);
            String labels = ownership.labels("homepage", appInstance, project).entrySet().stream()
                    .map(entry -> "      " + entry.getKey() + ": '" + entry.getValue() + "'\n")
                    .collect(java.util.stream.Collectors.joining());
            // The writer uses the catalog's declared durable path; no new image or public port is needed.
            Files.writeString(composeFile, "services:\n  homepage:\n    image: freshrss/freshrss:1.29.1\n"
                    + "    user: '" + Files.getAttribute(root, "unix:uid") + ":" + Files.getAttribute(root, "unix:gid") + "'\n"
                    + "    stop_grace_period: 1s\n    entrypoint: ['/bin/sh', '-c']\n    command:\n      - |\n"
                    + "        php -S 0.0.0.0:8080 -t /app/config >/dev/null 2>&1 &\n"
                    + "        trap 'exit 0' TERM INT\n"
                    + "        while true; do printf 'writer-record\\n' >> /app/config/records.txt; sleep 0.05; done\n"
                    + "    ports:\n      - '127.0.0.1:" + port + ":8080'\n"
                    + "    volumes:\n      - '" + records.getParent() + ":/app/config'\n"
                    + "    labels:\n" + labels);
            try (var manifest = new ClassPathResource("catalog/apps/homepage/manifest.yaml").getInputStream()) {
                Files.copy(manifest, layout.appRoot("homepage").resolve("manifest.yaml"));
            }
            var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
            new AppRuntimeMetadataWriter(() -> identity, Instant::now)
                    .write(catalog.findById("homepage").orElseThrow(), layout.appRoot("homepage"), appInstance, project);
            installed = JpaTestRepositories.installedAppRepository(layout);
            points = JpaTestRepositories.backupRepository(layout);
            register(true);
            compose = new ObservedCompose(records, accessUrl);
            var discovery = new ProcessHostDockerContainerDiscovery(new SystemCommandRunner());
            var inventory = new DockerInventoryService(() -> {
                if (compose.failObservation) {
                    compose.failObservation = false;
                    throw new IllegalStateException("injected inventory failure after real stop");
                }
                var observed = discovery.observeContainers();
                // Discovery stays within this fixture's Compose project; never classify the user's apps.
                return new HostDockerContainerDiscovery.DockerInventory(observed.successful(), observed.containers().stream()
                        .filter(container -> project.equals(container.labels().get("com.docker.compose.project"))).toList(), observed.diagnostic());
            }, ownership);
            var metadata = new AppRuntimeMetadataReader();
            var managed = new ManagedAppAttestationService(installed, layout, ownership, metadata,
                    new ManagedStorageContractService(new ManifestYamlReader(), new ManifestValidator(), inventory, metadata));
            var activity = new ActivityLogService(mock(ActivityLogRepository.class));
            var settings = JpaTestRepositories.projectSettingsRepository(layout);
            var projectSettings = new ProjectSettingsService(settings,
                activity);
            var files = new AutarkOsFileOpsService(layout, new LocalAutarkOsFileOperations());
            var destination = new BackupDestinationService(layout, settings);
            var coordinator = new RecoveryOperationCoordinator();
            jobs = new AutarkOsJobService(JpaTestRepositories.jobRepository(layout), Runnable::run, false);
            lifecycle = new AppLifecycleService(installed, compose, catalog, layout, new PostInstallGuideBuilder(),
                    new TailscaleService(), activity, points, new AppTelemetryService(compose), destination, coordinator,
                    files, managed, new AppAccessChecker(), inventory,
                    jobs);
            backups = new BackupService(layout, installed, points, activity, settings, projectSettings, lifecycle,
                    catalog, managed, new RuntimeFileOperations(), files, destination, coordinator,
                    jobs);
        }

        InstalledApp app(String status) {
            return new InstalledApp("homepage", "UF-01 writer", status, layout.appRoot("homepage").toString(),
                    project, accessUrl, Instant.parse("2026-06-20T12:00:00Z"));
        }

        void register(boolean policyEnabled) {
            InstalledApp app = app("Ready");
            installed.save(app);
            installed.saveOwnershipMetadata(new RuntimeModels.InstalledAppOwnershipMetadata("homepage", appInstance,
                    "homepage", identity.instanceId(), app.runtimePath(), "ready", "owned", app.installedAt(), app.installedAt()));
            installed.saveSettings("homepage", new InstallModels.InstallSettings(accessUrl, null, false, Map.of(),
                    new InstallModels.BackupPolicy(policyEnabled, "daily", 7)));
        }

        void startWriter() throws Exception {
            var result = compose.up(composeFile, project);
            assertThat(result.successful()).withFailMessage(String.join("\n", result.output())).isTrue();
            assertWriterRunning();
        }

        void assertWriterRunning() throws Exception {
            assertThat(compose.real.containers(composeFile, project)).isNotEmpty().allMatch(container -> "running".equals(container.state()));
            long size = Files.size(records);
            await(() -> Files.size(records) > size, "writer resumed appending records");
        }

        void changeDataAndRestore(RestorePoint point, String archived) throws Exception {
            assertThat(compose.real.stop(composeFile, project).successful()).isTrue();
            Files.writeString(records, "changed-after-backup\n");
            assertThat(compose.up(composeFile, project).successful()).isTrue();
            assertThat(backups.restorePlan(point.id(), "homepage").executable()).isTrue();
            assertThat(backups.restore(point.id(), "homepage", backups.restorePlan(point.id(), "homepage").planId()).status()).isEqualTo("completed");
            assertThat(compose.recordsBeforeLastStart).isEqualTo(archived);
            assertThat(Files.readString(records)).startsWith(archived).doesNotContain("changed-after-backup");
            assertWriterRunning();
        }

        @Override public void close() {
            var result = compose.real.down(composeFile, project);
            assertThat(result.successful()).withFailMessage("Disposable project cleanup: " + String.join("\n", result.output())).isTrue();
            assertThat(compose.real.containers(composeFile, project)).isEmpty();
        }
    }

    private static final class ObservedCompose implements DockerComposeExecutor {
        final ProcessDockerComposeExecutor real = new ProcessDockerComposeExecutor(new SystemCommandRunner());
        final Path records;
        final String url;
        int stopCalls;
        int startCalls;
        boolean failAfterNextStop;
        boolean failObservation;
        String lastStoppedRecords;
        String recordsBeforeLastStart;

        ObservedCompose(Path records, String url) { this.records = records; this.url = url; }
        @Override public RuntimeModels.DockerComposeResult up(Path path, String project) {
            startCalls++;
            try {
                recordsBeforeLastStart = Files.readString(records);
                var result = real.up(path, project);
                if (result.successful()) await(() -> {
                    try {
                        return java.net.http.HttpClient.newHttpClient().send(java.net.http.HttpRequest.newBuilder(java.net.URI.create(url))
                                .timeout(java.time.Duration.ofSeconds(1)).build(), java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
                    } catch (java.io.IOException exception) { return false; }
                }, "writer HTTP service became available");
                return result;
            } catch (Exception exception) { throw new IllegalStateException(exception); }
        }
        @Override public RuntimeModels.DockerComposeResult stop(Path path, String project) {
            stopCalls++;
            var result = real.stop(path, project);
            if (result.successful()) {
                try { lastStoppedRecords = Files.readString(records); }
                catch (java.io.IOException exception) { throw new IllegalStateException(exception); }
                if (failAfterNextStop) { failAfterNextStop = false; failObservation = true; }
            }
            return result;
        }
        @Override public RuntimeModels.DockerComposeResult restart(Path path, String project) { return real.restart(path, project); }
        @Override public RuntimeModels.DockerComposeResult down(Path path, String project) { return real.down(path, project); }
        @Override public RuntimeModels.DockerComposeResult ps(Path path, String project) { return real.ps(path, project); }
        @Override public List<RuntimeModels.DockerContainerStatus> containers(Path path, String project) { return real.containers(path, project); }
        @Override public List<RuntimeModels.ContainerTelemetry> stats(List<String> names) { return real.stats(names); }
    }

    private static void await(CheckedCondition condition, String expectation) throws Exception {
        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(10).toNanos();
        while (System.nanoTime() < deadline) {
            if (condition.satisfied()) return;
            Thread.sleep(50);
        }
        throw new AssertionError(expectation);
    }

    @FunctionalInterface private interface CheckedCondition { boolean satisfied() throws Exception; }
}
