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
                                "vaultwarden\tvaultwarden/server:latest\tUp\tapp=user\t443/tcp",
                                "autark-pro-agent\tprivate@sha256:"
                                        + "d".repeat(64)
                                        + "\tUp\t"
                                        + ProcessHostDockerContainerDiscovery
                                                .PRO_MANAGED_LABEL
                                        + "=true\t"),
                        false);
            }
        };
        ProcessHostDockerContainerDiscovery discovery =
                new ProcessHostDockerContainerDiscovery(runner);

        assertThat(discovery.findContainers())
                .extracting(HostModels.HostDockerContainer::name)
                .containsExactly("vaultwarden");
        assertThat(discovery.findContainers().getFirst().mounts())
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
                        List.of("vaultwarden\tvaultwarden/server:latest\tUp\tapp=user\t443/tcp"),
                        false);
            }
        };

        HostDockerContainerDiscovery.DockerInventory inventory = new ProcessHostDockerContainerDiscovery(runner).observeContainers();

        assertThat(inventory.successful()).isFalse();
        assertThat(inventory.diagnostic()).contains("container disappeared");
    }
}
