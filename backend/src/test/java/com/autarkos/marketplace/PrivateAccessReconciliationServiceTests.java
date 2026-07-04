package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.AppLifecycleService;
import com.autarkos.marketplace.install.ContainerTelemetry;
import com.autarkos.marketplace.install.DockerContainerStatus;
import com.autarkos.marketplace.install.DockerComposeExecutor;
import com.autarkos.marketplace.install.DockerComposeResult;
import com.autarkos.marketplace.install.InstallSettings;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstalledAppOwnershipMetadata;
import com.autarkos.marketplace.install.InstalledAppRepository;
import com.autarkos.marketplace.install.PostInstallGuideBuilder;
import com.autarkos.marketplace.install.PrivateAccessReconciliationItem;
import com.autarkos.marketplace.install.PrivateAccessReconciliationReport;
import com.autarkos.marketplace.install.PrivateAccessReconciliationService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.network.tailscale.TailscaleServeConfig;
import com.autarkos.network.tailscale.TailscaleServeMapping;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.testsupport.JpaTestRepositories;
import com.autarkos.network.tailscale.TailscaleStatus;

class PrivateAccessReconciliationServiceTests {

    @TempDir
    Path runtimeRoot;

    InstalledAppRepository repository;
    FakeDockerComposeExecutor composeExecutor;
    FakeTailscaleService tailscaleService;
    PrivateAccessReconciliationService reconciliationService;

    @BeforeEach
    void setUp() throws Exception {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        repository = new InstalledAppRepository(runtimeLayout);
        composeExecutor = new FakeDockerComposeExecutor();
        tailscaleService = new FakeTailscaleService();
        MarketplaceCatalogService catalogService = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        AppLifecycleService appLifecycleService = new AppLifecycleService(
                repository,
                composeExecutor,
                catalogService,
                () -> List.of(),
                runtimeLayout,
                new PostInstallGuideBuilder(),
                tailscaleService,
                false,
                null,
                JpaTestRepositories.backupRepository(runtimeLayout));
        reconciliationService = new PrivateAccessReconciliationService(appLifecycleService, catalogService, tailscaleService);

        Path appRoot = runtimeRoot.resolve("apps/vaultwarden");
        Files.createDirectories(appRoot);
        Files.writeString(appRoot.resolve("compose.yaml"), "services: {}\n");
        repository.save(new InstalledApp("vaultwarden", "Vaultwarden", "Installed", appRoot.toString(), "autark-os-vaultwarden", "http://localhost:8090", Instant.parse("2026-06-11T00:00:00Z")));
        repository.saveOwnershipMetadata(new InstalledAppOwnershipMetadata(
                "vaultwarden",
                "appinst_vaultwarden",
                "vaultwarden",
                "pos_test",
                appRoot.toString(),
                "ready",
                "owned",
                Instant.parse("2026-06-11T00:00:00Z"),
                Instant.parse("2026-06-11T00:00:00Z")));
    }

    @Test
    void verifiesDirectHttpsPortMatch() {
        repository.saveSettings("vaultwarden", privateSettings("http://localhost:8090", "https://autark-os.tail123.ts.net:8090"));
        tailscaleService.config = serveConfig(new TailscaleServeMapping("svc:vaultwarden", "tcp:8090", 8090, "http://127.0.0.1:8090", 8090));

        PrivateAccessReconciliationItem item = onlyItem();

        assertThat(item.status()).isEqualTo("healthy");
        assertThat(item.expectedLocalPort()).isEqualTo(8090);
        assertThat(item.expectedHttpsPort()).isEqualTo(8090);
        assertThat(item.desiredMapping()).isEqualTo("https:8090 -> 127.0.0.1:8090");
        assertThat(item.matchReason()).contains("matches");
        assertThat(item.verifiedAt()).isNotNull();
    }

    @Test
    void verifiesDefaultHttpsPort443WhenEndpointHostMatches() {
        repository.saveSettings("vaultwarden", privateSettings("http://localhost:8090", "https://autark-os.tail123.ts.net"));
        tailscaleService.config = serveConfig(new TailscaleServeMapping("svc:vaultwarden", "https://autark-os.tail123.ts.net/", null, "http://127.0.0.1:8090", 8090));

        PrivateAccessReconciliationItem item = onlyItem();

        assertThat(item.status()).isEqualTo("healthy");
        assertThat(item.expectedHttpsPort()).isEqualTo(443);
        assertThat(item.actualPort()).isNull();
        assertThat(item.target()).isEqualTo("http://127.0.0.1:8090");
    }

    @Test
    void usesObservedPublishedLocalPortWhenItChanges() {
        composeExecutor.containers = List.of(new DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 2 minutes (healthy)",
                "0.0.0.0:19090->80/tcp"));
        repository.saveSettings("vaultwarden", privateSettings("http://localhost:8090", "https://autark-os.tail123.ts.net:19090"));
        tailscaleService.config = serveConfig(new TailscaleServeMapping("svc:vaultwarden", "tcp:19090", 19090, "http://127.0.0.1:19090", 19090));

        PrivateAccessReconciliationItem item = onlyItem();

        assertThat(item.status()).isEqualTo("healthy");
        assertThat(item.expectedLocalPort()).isEqualTo(19090);
        assertThat(item.expectedHttpsPort()).isEqualTo(19090);
    }

    @Test
    void reportsMismatchedTargetPortWithDebugPayload() {
        repository.saveSettings("vaultwarden", privateSettings("http://localhost:8090", "https://autark-os.tail123.ts.net:8090"));
        tailscaleService.config = serveConfig(new TailscaleServeMapping("svc:vaultwarden", "tcp:8090", 8090, "http://127.0.0.1:8080", 8080));

        PrivateAccessReconciliationItem item = onlyItem();

        assertThat(item.status()).isEqualTo("mismatched");
        assertThat(item.detail()).contains("Expected local port 8090");
        assertThat(item.liveMappings()).contains("https:8090 -> http://127.0.0.1:8080");
        assertThat(item.matchReason()).contains("target local port");
        assertThat(item.verifiedAt()).isNull();
    }

    @Test
    void reportsMissingWhenNoLiveMappingTargetsTheAppPort() {
        repository.saveSettings("vaultwarden", privateSettings("http://localhost:8090", "https://autark-os.tail123.ts.net:8090"));
        tailscaleService.config = serveConfig(new TailscaleServeMapping("svc:other", "tcp:8080", 8080, "http://127.0.0.1:8080", 8080));

        PrivateAccessReconciliationItem item = onlyItem();

        assertThat(item.status()).isEqualTo("missing");
        assertThat(item.matchReason()).contains("No live mapping targets");
    }

    private PrivateAccessReconciliationItem onlyItem() {
        PrivateAccessReconciliationReport report = reconciliationService.report();
        assertThat(report.apps()).hasSize(1);
        return report.apps().getFirst();
    }

    private TailscaleServeConfig serveConfig(TailscaleServeMapping mapping) {
        return new TailscaleServeConfig(true, "available", "Read fake Serve config.", List.of(mapping), List.of(), Instant.now());
    }

    private InstallSettings privateSettings(String accessUrl, String privateAccessUrl) {
        return new InstallSettings(accessUrl, privateAccessUrl, true, java.util.Map.of(), com.autarkos.marketplace.install.BackupPolicy.defaults(), "private", "optional", null, "http", null, null, null, null, true);
    }

    private static class FakeTailscaleService extends TailscaleService {
        TailscaleServeConfig config = TailscaleServeConfig.unavailable("unavailable", "No fake config set.", List.of());

        @Override
        public TailscaleStatus status() {
            return new TailscaleStatus(true, true, "connected", "Connected.", "autark-os", "autark-os.tail123.ts.net.", List.of("100.64.0.2"), "tail123.ts.net", "user@example.com");
        }

        @Override
        public TailscaleServeConfig serveConfig() {
            return config;
        }
    }

    private static class FakeDockerComposeExecutor implements DockerComposeExecutor {
        List<DockerContainerStatus> containers = List.of(new DockerContainerStatus(
                "autark-os-vaultwarden",
                "vaultwarden",
                "running",
                "healthy",
                "Up 2 minutes (healthy)",
                "0.0.0.0:8090->80/tcp"));

        @Override
        public DockerComposeResult up(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("started"));
        }

        @Override
        public DockerComposeResult stop(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("stopped"));
        }

        @Override
        public DockerComposeResult restart(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("restarted"));
        }

        @Override
        public DockerComposeResult down(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("removed"));
        }

        @Override
        public DockerComposeResult ps(Path composeFile, String projectName) {
            return new DockerComposeResult(0, List.of("running"));
        }

        @Override
        public List<DockerContainerStatus> containers(Path composeFile, String projectName) {
            return containers;
        }

        @Override
        public List<ContainerTelemetry> stats(List<String> containerNames) {
            return List.of();
        }
    }
}
