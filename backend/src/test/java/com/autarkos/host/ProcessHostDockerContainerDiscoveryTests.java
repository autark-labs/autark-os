package com.autarkos.host;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.autarkos.system.SystemCommandRunner;

class ProcessHostDockerContainerDiscoveryTests {

    @Test
    void proRuntimeNeverAppearsAsAnUnmanagedCeApplication() {
        SystemCommandRunner runner = new SystemCommandRunner() {
            @Override
            public CommandExecutionResult run(
                    String... command) {
                if (command.length > 1 && "inspect".equals(command[1])) {
                    return new CommandExecutionResult(
                            0,
                            List.of("/vaultwarden\t[{\"Type\":\"bind\",\"Source\":\"/var/lib/autark-os/apps/vaultwarden/data\",\"Destination\":\"/data\",\"RW\":true}]"),
                            false);
                }
                return new CommandExecutionResult(
                        0,
                        List.of(
                                "{\"Names\":\"vaultwarden\",\"Image\":\"vaultwarden/server:latest\",\"Status\":\"Up\",\"Labels\":\"app=user\",\"Ports\":\"443/tcp\"}",
                                "{\"Names\":\"autark-pro-agent\",\"Labels\":\"com.autarkos.pro.managed=true\"}"),
                        false);
            }
        };
        ProcessHostDockerContainerDiscovery discovery =
                new ProcessHostDockerContainerDiscovery(runner);

        assertThat(discovery.observeContainers().containers())
                .extracting(HostModels.HostDockerContainer::name)
                .containsExactly("vaultwarden");
        assertThat(discovery.observeContainers().containers().getFirst().mounts())
                .singleElement()
                .satisfies(mount -> {
                    assertThat(mount.type()).isEqualTo("bind");
                    assertThat(mount.source()).isEqualTo("/var/lib/autark-os/apps/vaultwarden/data");
                    assertThat(mount.destination()).isEqualTo("/data");
                    assertThat(mount.readOnly()).isFalse();
                });
    }

    @Test
    void failedDockerCommandIsNotReportedAsASuccessfulEmptyInventory() {
        SystemCommandRunner runner = new SystemCommandRunner() {
            @Override
            public CommandExecutionResult run(String... command) {
                return new CommandExecutionResult(124, List.of("Docker status check timed out."), false, true);
            }
        };

        HostDockerContainerDiscovery.DockerInventory inventory = new ProcessHostDockerContainerDiscovery(runner).observeContainers();

        assertThat(inventory.successful()).isFalse();
        assertThat(inventory.containers()).isEmpty();
        assertThat(inventory.diagnostic()).contains("timed out");
    }

    @Test
    void failedLiveInspectionFailsTheWholeInventory() {
        SystemCommandRunner runner = new SystemCommandRunner() {
            @Override
            public CommandExecutionResult run(String... command) {
                if (command.length > 1 && "inspect".equals(command[1])) {
                    return new CommandExecutionResult(1, List.of("container disappeared"), false);
                }
                return new CommandExecutionResult(
                        0,
                        List.of("{\"Names\":\"vaultwarden\",\"Image\":\"vaultwarden/server:latest\",\"Status\":\"Up\",\"Labels\":\"app=user\",\"Ports\":\"443/tcp\"}"),
                        false);
            }
        };

        HostDockerContainerDiscovery.DockerInventory inventory = new ProcessHostDockerContainerDiscovery(runner).observeContainers();

        assertThat(inventory.successful()).isFalse();
        assertThat(inventory.diagnostic()).contains("container disappeared");
    }

    @Test
    void multilineImageLabelsDoNotBecomeContainerNames() {
        SystemCommandRunner runner = new SystemCommandRunner() {
            @Override
            public CommandExecutionResult run(String... command) {
                if ("inspect".equals(command[1])) {
                    assertThat(command).hasSize(5).endsWith("example");
                    return new CommandExecutionResult(0, List.of("/example\t[]"), false);
                }
                assertThat(command).contains("{{json .}}");
                return new CommandExecutionResult(0,
                        List.of("{\"Names\":\"example\",\"Labels\":\"description=first line\\nsecond\\tline,app=test\"}"), false);
            }
        };
        var inventory = new ProcessHostDockerContainerDiscovery(runner).observeContainers();
        assertThat(inventory.successful()).isTrue();
        assertThat(inventory.containers()).singleElement().satisfies(container -> {
            assertThat(container.name()).isEqualTo("example");
            assertThat(container.labels()).containsEntry("description", "first line\nsecond\tline");
        });
    }
}
