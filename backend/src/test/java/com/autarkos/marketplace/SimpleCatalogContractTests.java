package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.yaml.snakeyaml.Yaml;

import com.autarkos.discover.DiscoverSetupService;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.CatalogPackageCopier;
import com.autarkos.marketplace.install.ComposeRenderer;
import com.autarkos.marketplace.install.InstalledApp;
import com.autarkos.marketplace.install.ManagedStorageContractService;
import com.autarkos.marketplace.install.RuntimeDirectoryManager;
import com.autarkos.marketplace.install.models.RuntimeModels;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.BetaScope;

class SimpleCatalogContractTests {
    @TempDir Path root;

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

            var access = new DiscoverSetupService(null).schema(manifest).inputs().stream()
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
