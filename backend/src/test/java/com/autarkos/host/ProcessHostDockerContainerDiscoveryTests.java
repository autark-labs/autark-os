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
}
