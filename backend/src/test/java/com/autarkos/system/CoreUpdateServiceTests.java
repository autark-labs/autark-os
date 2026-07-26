package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
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
        assertThat(status.message()).contains("repair its update service");
        assertThat(status.installedVersion()).isEqualTo("0.9.1");
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
        assertThat(status.message()).contains("cannot verify published Autark-OS releases");
    }

    @Test
    void checkReturnsOneSimplePublishedUpdate() {
        RecordingReleaseSource releases = releases(Optional.of(release("0.9.2")));
        CoreUpdateService service = service(
                new RecordingHelper(
                        result("ready", "", "", "", ""),
                        result("ready", "", "", "", "")),
                releases);

        CoreUpdateModels.Status status = service.check();

        assertThat(status.status()).isEqualTo("update_available");
        assertThat(status.installedVersion()).isEqualTo("0.9.1");
        assertThat(status.availableRelease().version()).isEqualTo("0.9.2");
        assertThat(status.message()).isEqualTo("Autark-OS 0.9.2 is ready to install.");
    }

    @Test
    void checkSaysCurrentWhenNoPublishedUpdateIsNewer() {
        CoreUpdateService service = service(
                new RecordingHelper(
                        result("ready", "", "", "", ""),
                        result("ready", "", "", "", "")),
                releases(Optional.empty()));

        CoreUpdateModels.Status status = service.check();

        assertThat(status.status()).isEqualTo("current");
        assertThat(status.availableRelease()).isNull();
        assertThat(status.message()).isEqualTo("Autark-OS is up to date.");
    }

    @Test
    void managedInstallDownloadsThenStagesAndVerifiesAnOpaqueBundleId()
            throws Exception {
        RecordingHelper helper = new RecordingHelper(
                result("staged", "$bundle", "bundle-identity", "0.9.2", "arm64"),
                result("verified", "$bundle", "bundle-identity", "0.9.2", "arm64"),
                approval("approval-id"));
        RecordingReleaseSource releases = releases(Optional.of(release("0.9.2")));
        AutarkOsJobService jobs = mock(AutarkOsJobService.class);
        CoreUpdateService service = new CoreUpdateService(
                runtimeLayout(),
                jobs,
                helper,
                releases,
                new ObjectMapper());

        service.apply(new CoreUpdateModels.ApplyRequest("0.9.2"));

        assertThat(releases.checked()).isEqualTo(1);
    }

    private CoreUpdateService service(CoreUpdateService.HelperRunner helper) {
        return service(helper, releases(Optional.empty()));
    }

    private CoreUpdateService service(
            CoreUpdateService.HelperRunner helper,
            CoreUpdateService.ReleaseSource releases) {
        return new CoreUpdateService(
                runtimeLayout(),
                mock(AutarkOsJobService.class),
                helper,
                releases,
                new ObjectMapper());
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        return new RuntimeLayout(properties);
    }

    private static RecordingReleaseSource releases(
            Optional<CoreUpdateService.ManagedRelease> release) {
        return new RecordingReleaseSource(release);
    }

    private static CoreUpdateService.ManagedRelease release(String version) {
        return new CoreUpdateService.ManagedRelease(
                version,
                "beta",
                "https://github.com/autark-labs/autark-os/releases/tag/v" + version,
                "arm64",
                URI.create("https://github.com/autark-labs/autark-os/releases/download/v" + version
                        + "/autark-os-" + version + "-arm64.tar.gz"),
                "a".repeat(64),
                7);
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

    private static CoreUpdateService.HelperResult approval(String approvalId) {
        return new CoreUpdateService.HelperResult(
                true,
                false,
                "{\"status\":\"approved\",\"approvalId\":\"" + approvalId + "\"}");
    }

    private static class RecordingReleaseSource
            implements CoreUpdateService.ReleaseSource {
        private final Optional<CoreUpdateService.ManagedRelease> release;
        private int checked;

        private RecordingReleaseSource(
                Optional<CoreUpdateService.ManagedRelease> release) {
            this.release = release;
        }

        @Override
        public CoreUpdateService.ReleaseContext context() {
            return new CoreUpdateService.ReleaseContext("0.9.1", "beta", "arm64");
        }

        @Override
        public Optional<CoreUpdateService.ManagedRelease> findUpdate() {
            checked++;
            return release;
        }

        @Override
        public void download(
                CoreUpdateService.ManagedRelease release,
                Path destination) {
            try {
                Files.createDirectories(destination.getParent());
                Files.writeString(destination, "release");
            } catch (Exception exception) {
                throw new AssertionError(exception);
            }
        }

        int checked() {
            return checked;
        }
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
