package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.autarkos.access.AccessStatus;
import com.autarkos.access.AccessTailscaleStatus;
import com.autarkos.marketplace.install.AppInstanceView;

class CanonicalViewModelContractTests {

    private final ObjectMapper objectMapper = new ObjectMapper()
            .findAndRegisterModules()
            .disable(MapperFeature.REQUIRE_HANDLERS_FOR_JAVA8_TIMES)
            .disable(MapperFeature.REQUIRE_HANDLERS_FOR_JAVA8_OPTIONALS)
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);

    @Test
    void appInstanceViewKeepsFixtureFields() throws IOException {
        AppInstanceView view = new AppInstanceView(
                "appinst_vaultwarden",
                "vaultwarden",
                "Vaultwarden",
                "Security",
                "",
                "Ready",
                "ready",
                "running",
                "owned",
                "local_ready",
                "protected_by_restore_point",
                "http://localhost:8090",
                "",
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));

        assertFixtureShape("app-instance-ready.json", view);
    }

    @Test
    void systemSummaryKeepsFixtureFields() throws IOException {
        SystemSummaryModels.SystemSummary summary = new SystemSummaryModels.SystemSummary(
                "autark-os-test",
                "pos_test",
                "http://localhost:8082",
                new SetupProgressModels.SetupProgressSummary(false, "in_progress", "welcome", "Setup is in progress."),
                new SystemSummaryModels.DockerSummary(true, "Docker is ready."),
                new SystemSummaryModels.AccessSummary("local_only", "Local access is ready."),
                new SystemSummaryModels.AppsSummary(0, 0, 0, List.of()),
                new SystemSummaryModels.BackupSummary("not_configured", "No restore point is required yet."),
                new SystemSummaryModels.StorageSummary("unknown", "Storage details are available from the Storage page."),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));

        assertFixtureShape("system-summary-empty.json", summary);
    }

    @Test
    void accessStatusKeepsFixtureFields() throws IOException {
        AccessStatus status = new AccessStatus(
                "local_only",
                "http://localhost:8082",
                new AccessTailscaleStatus(false, false, "", false, false, false, "unavailable"),
                List.of(),
                List.of(),
                List.of(),
                Instant.parse("2026-06-20T12:00:00Z"));

        assertFixtureShape("access-status-local-only.json", status);
    }

    @Test
    void recommendedActionKeepsFixtureFields() throws IOException {
        RecommendedAction action = new RecommendedAction(
                "no-action-needed",
                "success",
                "No action needed",
                "Autark-OS does not see anything that needs your attention right now.",
                Optional.empty(),
                Optional.empty(),
                List.of());

        assertFixtureShape("recommended-action-none.json", action);
    }

    @Test
    void setupProgressKeepsFixtureFields() throws IOException {
        SetupProgressModels.SetupProgress progress = new SetupProgressModels.SetupProgress(
                1,
                List.of(),
                List.of(),
                "welcome",
                false,
                Instant.parse("2026-06-20T12:00:00Z"));

        assertFixtureShape("setup-progress-fresh.json", progress);
    }

    private void assertFixtureShape(String fixtureName, Object actual) throws IOException {
        JsonNode expected = objectMapper.readTree(getClass().getResourceAsStream("/contracts/sprint2/" + fixtureName));
        JsonNode actualJson = objectMapper.valueToTree(actual);
        assertObjectShape(expected, actualJson, fixtureName);
    }

    private void assertObjectShape(JsonNode expected, JsonNode actual, String path) {
        assertThat(actual.isObject()).as(path + " is an object").isTrue();
        expected.fieldNames().forEachRemaining(field -> {
            String childPath = path + "." + field;
            assertThat(actual.has(field)).as(childPath + " exists").isTrue();
            JsonNode expectedChild = expected.get(field);
            JsonNode actualChild = actual.get(field);
            if (expectedChild.isObject()) {
                assertObjectShape(expectedChild, actualChild, childPath);
            }
        });
    }
}
