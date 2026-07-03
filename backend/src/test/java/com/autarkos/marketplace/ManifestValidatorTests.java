package com.autarkos.marketplace;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.catalog.ManifestValidationException;
import com.autarkos.marketplace.catalog.ManifestValidator;
import com.autarkos.marketplace.model.AccessManifest;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.CatalogSmokeTest;
import com.autarkos.marketplace.model.HealthManifest;
import com.autarkos.marketplace.model.RuntimeManifest;
import com.autarkos.marketplace.model.SetupManifest;
import com.autarkos.marketplace.model.UsageManifest;

class ManifestValidatorTests {

    private final ManifestValidator validator = new ManifestValidator();

    @Test
    void rejectsDuplicateAppIdsAcrossCatalog() {
        ApplicationManifest first = manifest("duplicate-app", "8090:80");
        ApplicationManifest second = manifest("duplicate-app", "8091:80");

        assertThatThrownBy(() -> validator.validateCatalog(List.of(first, second)))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("Duplicate app id");
    }

    @Test
    void rejectsDuplicatePreferredPortsAcrossCatalog() {
        ApplicationManifest first = manifest("first-app", "8090:80");
        ApplicationManifest second = manifest("second-app", "8090:8080");

        assertThatThrownBy(() -> validator.validateCatalog(List.of(first, second)))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("Duplicate preferred host port");
    }

    @Test
    void allowsSameHostPortWhenProtocolsDiffer() {
        validator.validateCatalog(List.of(
                manifest("dns-tcp", "5353:53/tcp"),
                manifest("dns-udp", "5353:53/udp")));
    }

    @Test
    void rejectsUnsafeManifestRuntimeFields() {
        ApplicationManifest manifest = manifest("unsafe-app", "not-a-port");

        assertThatThrownBy(() -> validator.validate(manifest))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("runtime.ports");
    }

    @Test
    void rejectsWebAppsWithoutAccessUrl() {
        ApplicationManifest manifest = manifest("web-app", "8090:80", "");

        assertThatThrownBy(() -> validator.validate(manifest))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("metadata.accessUrl is required");
    }

    @Test
    void rejectsUnknownHealthTypes() {
        ApplicationManifest manifest = manifest("health-app", "8090:80", "http://localhost:8090", new HealthManifest("mystery", "/", 180, "Ready", "Starting", "Failed", "Unknown health type."));

        assertThatThrownBy(() -> validator.validate(manifest))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("health.type");
    }

    @Test
    void rejectsInvalidStartupGrace() {
        ApplicationManifest manifest = manifest("health-app", "8090:80", "http://localhost:8090", new HealthManifest("http", "/", 5, "Ready", "Starting", "Failed", "Too short."));

        assertThatThrownBy(() -> validator.validate(manifest))
                .isInstanceOf(ManifestValidationException.class)
                .hasMessageContaining("health.startupGraceSeconds");
    }

    private ApplicationManifest manifest(String id, String port) {
        return manifest(id, port, "http://localhost:8090");
    }

    private ApplicationManifest manifest(String id, String port, String accessUrl) {
        return manifest(id, port, accessUrl, HealthManifest.defaults(AccessManifest.defaults(), UsageManifest.defaults()));
    }

    private ApplicationManifest manifest(String id, String port, String accessUrl, HealthManifest health) {
        return new ApplicationManifest(
                id,
                "Test App",
                "Utilities",
                "Test app",
                "Test app",
                "Verified",
                "0",
                "0",
                "",
                "1.0.0",
                "Today",
                "1 MB",
                "Autark-OS",
                "Local",
                "https://example.com/autark-os/test-app",
                "https://example.com/autark-os/test-app/docs",
                "1 minute",
                "Easy",
                "Ready",
                "Test manifest is ready for automated validation.",
                accessUrl,
                List.of("Test"),
                List.of("Testing"),
                List.of("Test install"),
                "A test app.",
                "Deploys a test app.",
                List.of("1 CPU"),
                List.of("Container"),
                List.of(),
                new AccessManifest("web", "local", false, false, List.of("Used by manifest validation tests.")),
                UsageManifest.defaults(),
                SetupManifest.defaults(),
                health,
                List.of(new CatalogSmokeTest("Install plan", "Passed", "Validation test manifest has a generated install plan.")),
                new RuntimeManifest(
                        id,
                        "autark-os-" + id,
                        "test/image:1.0.0",
                        "autark-os-apps",
                        "/var/lib/autark-os/apps/" + id,
                        List.of(port),
                        List.of("/var/lib/autark-os/apps/" + id + "/data:/data"),
                        List.of(),
                        List.of("autark-os.managed=true", "autark-os.app-id=" + id),
                        List.of("data"),
                        false));
    }
}
