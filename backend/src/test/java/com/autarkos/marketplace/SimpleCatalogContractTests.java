package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.yaml.snakeyaml.Yaml;

import com.autarkos.discover.DiscoverSetupService;
import com.autarkos.discover.DiscoverInstallPreviewService;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.PortAllocator;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.CatalogPackageCopier;
import com.autarkos.marketplace.install.ComposeRenderer;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.InstallCustomizationResolver;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.RuntimeDirectoryManager;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.BetaScope;

class SimpleCatalogContractTests {
    @TempDir Path root;

    @Test
    void memosDefaultKeepsItsDashboardPrivateInDiscoverAndRuntime() {
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var memos = catalog.findById("memos").orElseThrow();
        var setup = new DiscoverSetupService(null, com.autarkos.testsupport.JpaTestRepositories.defaultProjectSettings());

        assertThat(memos.access().defaultMode()).isEqualTo("private");
        assertThat(InstallCustomizationResolver.accessMode(memos, null)).isEqualTo("private");
        assertThat(setup.defaults(memos).stringValue("accessMode")).isEqualTo("private_only");
    }

    @Test
    void allCatalogDefaultsAgreeAcrossSetupPreviewRuntimeAndCompose() throws Exception {
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var settings = com.autarkos.testsupport.JpaTestRepositories.defaultProjectSettings();
        var setup = new DiscoverSetupService(null, settings);
        var preview = new DiscoverInstallPreviewService(null, setup);
        var properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(root.toString());
        var renderer = new ComposeRenderer(new RuntimeLayout(properties));
        var lanDefaults = List.of("freshrss", "homepage", "gitea", "jellyfin", "uptime-kuma", "prowlarr", "radarr", "sonarr");

        assertThat(BetaScope.CURRENT.apps()).hasSize(35);
        for (var app : BetaScope.CURRENT.apps()) {
            var manifest = catalog.findById(app.id()).orElseThrow();
            String expected = lanDefaults.contains(app.id()) ? "local-and-private" : "private";
            String setupValue = lanDefaults.contains(app.id()) ? "private_lan" : "private_only";
            var answers = setup.defaults(manifest);
            var choices = setup.schema(manifest).inputs().stream().filter(input -> input.id().equals("accessMode"))
                    .findFirst().orElseThrow().options();
            assertThat(answers.stringValue("accessMode")).as(app.id()).isEqualTo(setupValue);
            assertThat(choices).filteredOn(option -> option.recommended()).extracting(option -> option.value())
                    .as(app.id()).containsExactly(setupValue);
            var options = preview.installOptions(manifest, answers);
            assertThat(options.access().mode()).as(app.id()).isEqualTo(expected);

            var ports = mock(PortAllocator.class);
            when(ports.resolveServicePorts(manifest, null)).thenReturn(Map.of(manifest.runtime().containerName(), manifest.runtime().ports()));
            when(ports.resolveServicePorts(manifest, options.ports())).thenReturn(Map.of(manifest.runtime().containerName(), manifest.runtime().ports()));
            when(ports.accessUrl(manifest, manifest.runtime().ports())).thenReturn(manifest.accessUrl());
            var resolver = new InstallCustomizationResolver(ports, settings);
            var direct = resolver.resolve(manifest, null);
            var fromDiscover = resolver.resolve(manifest, options);
            assertThat(direct.accessMode()).as(app.id()).isEqualTo(expected).isEqualTo(fromDiscover.accessMode());
            assertThat(direct.tailscaleEnabled()).as(app.id()).isTrue();
            String compose = Files.readString(renderer.render(manifest, root.resolve(app.id()), direct));
            String dashboardPort = Integer.toString(java.net.URI.create(manifest.accessUrl()).getPort());
            var dashboardPorts = ComposeRenderer.scopedPorts(manifest, direct.ports(), direct.accessMode()).stream()
                    .filter(port -> {
                        String[] parts = port.split(":");
                        return parts.length >= 2 && parts[parts.length - 2].equals(dashboardPort);
                    }).toList();
            assertThat(dashboardPorts).as(app.id()).isNotEmpty();
            assertThat(dashboardPorts).as(app.id()).allMatch(port -> port.startsWith("127.0.0.1:") == expected.equals("private"));
            dashboardPorts.forEach(port -> assertThat(compose).as(app.id()).contains("\"" + port + "\""));
        }
    }

    @Test
    void explicitChoicesAndRuntimeLimitsAreNotReplacedByCatalogDefaults() {
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var memos = catalog.findById("memos").orElseThrow();
        for (String mode : List.of("local", "network", "private", "local-and-private")) {
            assertThat(InstallCustomizationResolver.accessMode(memos, new InstallOptionsRequest.AccessOptions(null, mode)))
                    .isEqualTo(mode);
        }
        assertThat(InstallCustomizationResolver.accessMode(memos, new InstallOptionsRequest.AccessOptions(false))).isEqualTo("network");
        assertThat(InstallCustomizationResolver.accessMode(memos, new InstallOptionsRequest.AccessOptions(true))).isEqualTo("local-and-private");
        var syncthing = catalog.findById("syncthing").orElseThrow();
        assertThatThrownBy(() -> InstallCustomizationResolver.accessMode(syncthing, new InstallOptionsRequest.AccessOptions(true, "local-and-private")))
                .hasMessageContaining("dashboard must stay");
        var vaultwarden = catalog.findById("vaultwarden").orElseThrow();
        assertThatThrownBy(() -> InstallCustomizationResolver.accessMode(vaultwarden, new InstallOptionsRequest.AccessOptions(false, "local")))
                .hasMessageContaining("private HTTPS");
        var adguard = catalog.findById("adguard-home").orElseThrow();
        assertThatThrownBy(() -> InstallCustomizationResolver.accessMode(adguard, new InstallOptionsRequest.AccessOptions(true, "private")))
                .hasMessageContaining("host networking");
        var setup = new DiscoverSetupService(null, com.autarkos.testsupport.JpaTestRepositories.defaultProjectSettings());
        assertThat(setup.schema(adguard).inputs().stream().filter(input -> input.id().equals("accessMode"))
                .findFirst().orElseThrow().options()).extracting(option -> option.value())
                .containsExactly("private_lan", "lan_only");
    }

    @Test
    void eligibleAppsRenderOneUnprivilegedServiceWithManagedColdBackupStorage() throws Exception {
        var catalog = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator());
        var properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(root.toString());
        var layout = new RuntimeLayout(properties);
        var renderer = new ComposeRenderer(layout);

        assertThat(BetaScope.CURRENT.apps()).hasSize(35);
        assertThat(BetaScope.CURRENT.apps().stream().filter(BetaScope.App::starter).map(BetaScope.App::id))
                .containsExactly("freshrss", "homepage", "syncthing");
        for (var app : BetaScope.CURRENT.apps()) {
            var manifest = catalog.findById(app.id()).orElseThrow();
            var runtime = manifest.runtime();
            assertThat(runtime.multiService()).as(app.id()).isFalse();
            assertThat(runtime.privileged()).as(app.id()).isFalse();
            assertThat(runtime.network()).as(app.id()).isNotEqualTo("host");
            assertThat(runtime.backupStrategy()).as(app.id()).isEqualTo("cold_file");
            assertThat(runtime.image()).as(app.id()).doesNotEndWith(":latest");
            assertThat(runtime.volumes()).as(app.id()).allMatch(v -> v.startsWith(runtime.runtimeRoot() + "/"));

            Path appRoot = new RuntimeDirectoryManager(layout).prepare(manifest);
            new CatalogPackageCopier().copyManifest(manifest, appRoot);
            new CatalogPackageCopier().copyProvisionedFiles(manifest, appRoot);
            Path compose = renderer.render(manifest, appRoot);
            var metadata = mock(RuntimeModels.AppRuntimeMetadata.class);
            when(metadata.mountContract()).thenReturn(ManagedStorageContractService.readComposeMounts(compose));
            var installed = new InstalledApp(app.id(), manifest.name(), "Ready", appRoot.toString(),
                    runtime.composeProject(), manifest.accessUrl(), Instant.EPOCH);
            var storage = new ManagedStorageContractService(new ManifestYamlReader(), new ManifestValidator(), null, null)
                    .require(installed, metadata, false);
            assertThat(storage.protectedPaths().keySet()).as(app.id()).containsExactlyInAnyOrderElementsOf(runtime.backupPaths());
            Map<?, ?> document = new Yaml().load(Files.readString(compose));
            assertThat((Map<?, ?>) document.get("services")).hasSize(1);
            for (String folder : runtime.backupPaths()) {
                assertThat(Files.isDirectory(appRoot.resolve(folder))).as(app.id() + "/" + folder).isTrue();
            }
            assertThat(Files.isRegularFile(Path.of("../frontend/public" + manifest.image()))).as(app.id()).isTrue();

            var access = new DiscoverSetupService(null, com.autarkos.testsupport.JpaTestRepositories.defaultProjectSettings()).schema(manifest).inputs().stream()
                    .filter(input -> input.id().equals("accessMode")).findFirst().orElseThrow();
            if (manifest.usage().privateHttpsRequired()) {
                assertThat(access.options()).extracting(option -> option.value())
                        .containsExactly("private_only");
                assertThat(ComposeRenderer.scopedPorts(manifest, runtime.ports(), "private").getFirst())
                        .startsWith("127.0.0.1:");
            } else if (manifest.access().privateDashboard()) {
                assertThat(access.options()).extracting(option -> option.value())
                        .containsExactly("private_only", "local_only");
                assertThat(ComposeRenderer.scopedPorts(manifest, runtime.ports(), "network").getFirst())
                        .startsWith("127.0.0.1:");
            }
        }
    }
}
