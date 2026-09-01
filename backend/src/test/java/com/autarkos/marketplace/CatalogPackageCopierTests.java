package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.catalog.ManifestYamlReader;
import com.autarkos.marketplace.catalog.MarketplaceCatalogService;
import com.autarkos.marketplace.install.CatalogPackageCopier;
import com.autarkos.marketplace.model.ApplicationManifest;

class CatalogPackageCopierTests {

    @TempDir
    Path appRoot;

    @Test
    void provisionsPrometheusDefaultConfigurationWithoutReplacingOwnerChanges() throws Exception {
        ApplicationManifest prometheus = new MarketplaceCatalogService(new ManifestYamlReader(), new ManifestValidator())
                .findById("prometheus")
                .orElseThrow();
        CatalogPackageCopier copier = new CatalogPackageCopier();

        copier.copyProvisionedFiles(prometheus, appRoot);

        Path config = appRoot.resolve("config/prometheus.yml");
        assertThat(Files.readString(config)).contains("scrape_interval: 15s");

        Files.writeString(config, "global:\n  scrape_interval: 30s\n");
        copier.copyProvisionedFiles(prometheus, appRoot);

        assertThat(Files.readString(config)).isEqualTo("global:\n  scrape_interval: 30s\n");
    }
}
