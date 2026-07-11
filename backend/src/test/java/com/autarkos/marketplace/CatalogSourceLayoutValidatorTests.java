package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.catalog.CatalogSourceLayoutValidator;
import com.autarkos.marketplace.catalog.ManifestValidationException;

class CatalogSourceLayoutValidatorTests {

    private final CatalogSourceLayoutValidator validator = new CatalogSourceLayoutValidator();

    @TempDir
    Path temporaryDirectory;

    @Test
    void rejectsAnIncompleteCatalogDirectory() throws Exception {
        Files.createDirectories(temporaryDirectory.resolve("portainer"));

        assertThatThrownBy(() -> validator.validate(temporaryDirectory))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("portainer is missing manifest.yaml")
                .hasMessageContaining("portainer is missing compose.yaml");
    }

    @Test
    void rejectsAManifestThatOmitsRequiredReleaseSections() throws Exception {
        Path app = Files.createDirectories(temporaryDirectory.resolve("incomplete-app"));
        Files.writeString(app.resolve("manifest.yaml"), "id: incomplete-app\nmetadata: {}\n");
        Files.writeString(app.resolve("compose.yaml"), "services: {}\n");

        assertThatThrownBy(() -> validator.validate(temporaryDirectory))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("incomplete-app is missing required health: manifest section")
                .hasMessageContaining("incomplete-app is missing required runtime: manifest section");
    }

    @Test
    void validatesEveryIncludedSourceCatalogDirectory() {
        assertThatCode(() -> validator.validate(Path.of("src/main/resources/catalog/apps")))
                .doesNotThrowAnyException();
    }
}
