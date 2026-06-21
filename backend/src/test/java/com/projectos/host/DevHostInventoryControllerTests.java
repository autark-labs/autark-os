package com.projectos.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class DevHostInventoryControllerTests {

    @Test
    void returnsFixturesInDevMode() {
        DevHostInventoryController controller = new DevHostInventoryController(true);

        assertThat(controller.fixture()).extracting(HostInventoryResource::ownershipState)
                .contains("owned_managed", "foreign_project_os", "legacy_project_os", "external_docker", "unknown_conflict");
    }

    @Test
    void hidesFixturesOutsideDevMode() {
        DevHostInventoryController controller = new DevHostInventoryController(false);

        assertThatThrownBy(controller::fixture)
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }
}
