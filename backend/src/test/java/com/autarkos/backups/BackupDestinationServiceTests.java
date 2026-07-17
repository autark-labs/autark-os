package com.autarkos.backups;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.install.InstallationException;
import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.system.ProjectSettingsRepository;

class BackupDestinationServiceTests {

    @TempDir
    Path tempDir;

    private Path externalTestRoot;

    @AfterEach
    void removeExternalTestRoot() throws IOException {
        if (externalTestRoot == null || !Files.exists(externalTestRoot)) {
            return;
        }
        try (var paths = Files.walk(externalTestRoot)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // Test cleanup must not hide an assertion failure.
                }
            });
        }
    }

    @Test
    void configuresAnExternalDestinationAndPersistsItsMountIdentity() throws Exception {
        Map<String, String> settings = new HashMap<>();
        RecordingConfigurator configurator = new RecordingConfigurator();
        Path external = Files.createDirectories(externalRoot().resolve("backups"));
        BackupDestinationService service = service(settings, configurator, external);

        BackupModels.BackupDestination destination = service.configure(external.toString());

        assertThat(destination.kind()).isEqualTo("external");
        assertThat(destination.status()).isEqualTo("ready");
        assertThat(destination.protectsAgainstRuntimeDriveFailure()).isTrue();
        assertThat(settings).containsEntry(BackupDestinationService.DESTINATION_PATH, external.toString());
        assertThat(settings).containsEntry(BackupDestinationService.DESTINATION_IDENTITY, "external-drive");
        assertThat(configurator.configured).isEqualTo(destination);
    }

    @Test
    void treatsADisconnectedExternalDriveAsMissingWithoutFallingBackToInternalStorage() {
        Map<String, String> settings = new HashMap<>();
        Path missing = externalRoot().resolve("backups");
        settings.put(BackupDestinationService.DESTINATION_PATH, missing.toString());
        settings.put(BackupDestinationService.DESTINATION_IDENTITY, "external-drive");
        BackupDestinationService service = service(settings, new RecordingConfigurator(), externalRoot());

        BackupModels.BackupDestination destination = service.current();

        assertThat(destination.status()).isEqualTo("missing");
        assertThat(destination.ready()).isFalse();
        assertThat(destination.message()).contains("will not fall back to internal storage");
        assertThatThrownBy(service::activeRoot)
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("will not fall back to internal storage");
    }

    @Test
    void rejectsRelativePathsBeforeTheyCanBecomeAnApprovedDestination() {
        BackupDestinationService service = service(new HashMap<>(), new RecordingConfigurator(), externalRoot());

        assertThatThrownBy(() -> service.preview("relative/backups"))
                .isInstanceOf(InstallationException.class)
                .hasMessageContaining("absolute path");
    }

    private BackupDestinationService service(Map<String, String> settings, RecordingConfigurator configurator, Path externalRoot) {
        ProjectSettingsRepository repository = mock(ProjectSettingsRepository.class);
        when(repository.readAll()).thenAnswer(invocation -> new HashMap<>(settings));
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            Map<String, String> values = invocation.getArgument(0, Map.class);
            settings.putAll(values);
            return null;
        }).when(repository).saveValues(anyMap());

        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(tempDir.resolve("runtime").toString());
        RuntimeLayout runtimeLayout = new RuntimeLayout(properties);
        return new BackupDestinationService(runtimeLayout, repository, configurator, new TestInspector(runtimeLayout.runtimeRoot(), externalRoot));
    }

    private Path externalRoot() {
        if (externalTestRoot == null) {
            externalTestRoot = Path.of(System.getProperty("user.home"), ".autark-os-destination-test-" + UUID.randomUUID()).toAbsolutePath().normalize();
        }
        return externalTestRoot;
    }

    private static final class RecordingConfigurator implements BackupDestinationService.DestinationConfigurator {
        private BackupModels.BackupDestination configured;

        @Override
        public void configure(BackupModels.BackupDestination destination, List<Path> history) {
            configured = destination;
        }
    }

    private static final class TestInspector implements BackupDestinationService.DestinationInspector {
        private final Path runtimeRoot;
        private final Path externalRoot;

        private TestInspector(Path runtimeRoot, Path externalRoot) {
            this.runtimeRoot = runtimeRoot;
            this.externalRoot = externalRoot;
        }

        @Override
        public void createDirectories(Path path) throws IOException {
            Files.createDirectories(path);
        }

        @Override
        public BackupDestinationService.Inspection inspect(Path path) {
            Path normalized = path.toAbsolutePath().normalize();
            boolean external = normalized.startsWith(externalRoot.toAbsolutePath().normalize());
            return new BackupDestinationService.Inspection(
                    external ? externalRoot.toString() : runtimeRoot.toString(),
                    external ? "external-drive" : "runtime-drive",
                    "ext4",
                    true,
                    2L * 1024L * 1024L * 1024L);
        }
    }
}
