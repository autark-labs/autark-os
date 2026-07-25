package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.fasterxml.jackson.databind.ObjectMapper;

class CoreUpdateServiceTests {

    @TempDir
    Path tempDir;

    @Test
    void unavailableHelperBecomesGuidedRepairState() {
        CoreUpdateService service = service(new RecordingHelper(
                new CoreUpdateService.HelperResult(false, true, "not json")));

        CoreUpdateModels.Status status = service.status();

        assertThat(status.status()).isEqualTo("repair_required");
        assertThat(status.helperAvailable()).isFalse();
        assertThat(status.repairAvailable()).isTrue();
        assertThat(status.message()).contains("protected update helper repaired");
    }

    @Test
    void statusRequiresTheCompleteProtectedUpdateEnvironment() {
        RecordingHelper helper = new RecordingHelper(
                result("ready", "a".repeat(32), "candidate", "0.9.2", "arm64"),
                result("ready", "a".repeat(32), "candidate", "0.9.2", "arm64"));
        CoreUpdateService service = service(helper);

        CoreUpdateModels.Status status = service.status();

        assertThat(status.helperAvailable()).isTrue();
        assertThat(helper.operations()).containsExactly("status", "health");
    }

    @Test
    void missingReleaseTrustKeyRemainsUnavailableWithoutOfferingAFalseRepair() {
        RecordingHelper helper = new RecordingHelper(
                result("ready", "a".repeat(32), "candidate", "0.9.2", "arm64"),
                new CoreUpdateService.HelperResult(false, false,
                        "{\"status\":\"error\",\"code\":\"signing_key_missing\"}"));
        CoreUpdateService service = service(helper);

        CoreUpdateModels.Status status = service.status();

        assertThat(status.status()).isEqualTo("repair_required");
        assertThat(status.helperAvailable()).isFalse();
        assertThat(status.repairAvailable()).isFalse();
        assertThat(status.message()).contains("release signing is not configured");
    }

    @Test
    void stagesOnlyOpaqueUploadThenVerifiesTheSameGeneratedBundleId()
            throws Exception {
        RecordingHelper helper = new RecordingHelper(
                result("staged", "$bundle", "bundle-identity", "0.9.2", "arm64"),
                result("verified", "$bundle", "bundle-identity", "0.9.2", "arm64"));
        CoreUpdateService service = service(helper);
        MockMultipartFile upload = new MockMultipartFile(
                "bundle", "anything.tar.gz", "application/gzip",
                new ByteArrayInputStream("release".getBytes(StandardCharsets.UTF_8)));

        CoreUpdateModels.Status status = service.stage(upload);

        assertThat(status.status()).isEqualTo("verified");
        assertThat(status.candidate().identity()).isEqualTo("sha256:bundle-identity");
        assertThat(helper.operations()).containsExactly("stage", "verify");
        String stagedBundleId = helper.arguments().getFirst().get(1);
        assertThat(stagedBundleId).matches("[a-f0-9]{32}");
        assertThat(helper.arguments().get(1)).containsExactly("--bundle-id", stagedBundleId);
        assertThat(tempDir.resolve("runtime/core-update-inbox").resolve(stagedBundleId + ".tar.gz"))
                .exists();
    }

    @Test
    void applyRejectsChangedIdentityAndWrongOneTimeConfirmation() {
        RecordingHelper helper = new RecordingHelper(
                result("verified", "a".repeat(32), "reviewed", "0.9.2", "arm64"),
                result("verified", "a".repeat(32), "reviewed", "0.9.2", "arm64"));
        CoreUpdateService service = service(helper);

        assertThatThrownBy(() -> service.apply(new CoreUpdateModels.ApplyRequest(
                "a".repeat(32), "sha256:other", "INSTALL-AUTARK-OS-0.9.2")))
                .isInstanceOf(CoreUpdateException.class)
                .hasMessageContaining("changed after review");
        assertThatThrownBy(() -> service.apply(new CoreUpdateModels.ApplyRequest(
                "a".repeat(32), "sha256:reviewed", "yes")))
                .isInstanceOf(CoreUpdateException.class)
                .hasMessageContaining("exact update confirmation");
    }

    private CoreUpdateService service(CoreUpdateService.HelperRunner helper) {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        return new CoreUpdateService(
                new RuntimeLayout(properties),
                mock(AutarkOsJobService.class),
                helper,
                new ObjectMapper());
    }

    private static CoreUpdateService.HelperResult result(
            String status,
            String bundleId,
            String identity,
            String version,
            String architecture) {
        String json = """
                {"schemaVersion":1,"status":"%s","message":"safe","updatedAt":"2026-07-24T00:00:00Z","candidate":{"bundleId":"%s","identity":"sha256:%s","version":"%s","architecture":"%s"}}
                """.formatted(status, bundleId, identity, version, architecture);
        return new CoreUpdateService.HelperResult(true, false, json);
    }

    private static class RecordingHelper implements CoreUpdateService.HelperRunner {
        private final ArrayDeque<CoreUpdateService.HelperResult> results;
        private final List<String> operations = new ArrayList<>();
        private final List<List<String>> arguments = new ArrayList<>();

        private RecordingHelper(CoreUpdateService.HelperResult... results) {
            this.results = new ArrayDeque<>(List.of(results));
        }

        @Override
        public CoreUpdateService.HelperResult run(
                String operation,
                List<String> arguments,
                Duration timeout) {
            operations.add(operation);
            this.arguments.add(List.copyOf(arguments));
            CoreUpdateService.HelperResult result = results.isEmpty()
                    ? new CoreUpdateService.HelperResult(false, false, "")
                    : results.removeFirst();
            if (result.output().contains("\"$bundle\"")) {
                return new CoreUpdateService.HelperResult(
                        result.successful(),
                        result.missing(),
                        result.output().replace("\"$bundle\"", "\"" + arguments.get(1) + "\""));
            }
            return result;
        }

        List<String> operations() {
            return operations;
        }

        List<List<String>> arguments() {
            return arguments;
        }
    }
}
