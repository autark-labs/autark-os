package com.projectos.host;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.projectos.marketplace.install.DockerOwnershipService;
import com.projectos.marketplace.runtime.ProjectOsRuntimeProperties;
import com.projectos.marketplace.runtime.RuntimeLayout;
import com.projectos.system.ProjectOsIdentity;

class HostInventoryServiceTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void classifiesVisibleDockerResourcesByOwnership() {
        HostInventoryService service = service(List.of(
                container("projectos_home_vaultwarden", "vaultwarden", "current-instance", "runtime-hash"),
                container("projectos_other_jellyfin", "jellyfin", "other-instance", "runtime-hash"),
                container("project-os-homepage", "homepage", "", ""),
                new HostDockerContainer("postgres", "postgres:16", "Up 10 minutes", Map.of(), "5432/tcp")));

        List<HostInventoryResource> inventory = service.inventory(false);

        assertThat(inventory).extracting(HostInventoryResource::ownershipState)
                .containsExactlyInAnyOrder(
                        "external_docker",
                        "legacy_project_os",
                        "foreign_project_os",
                        "owned_managed");
        assertThat(inventory).filteredOn(resource -> resource.displayName().equals("jellyfin"))
                .singleElement()
                .satisfies(resource -> {
                    assertThat(resource.managementMode()).isEqualTo("observed");
                    assertThat(resource.catalogAppId()).isEqualTo("jellyfin");
                    assertThat(resource.availableActions()).containsExactly("view_details", "open", "ignore");
                });
    }

    @Test
    void ignoredResourcesDisappearUnlessRequested() {
        HostInventoryService service = service(List.of(
                container("projectos_other_jellyfin", "jellyfin", "other-instance", "runtime-hash"),
                new HostDockerContainer("postgres", "postgres:16", "Up 10 minutes", Map.of(), "")));

        ActionResult result = service.ignore("docker:projectos_other_jellyfin");

        assertThat(result.ok()).isTrue();
        assertThat(service.inventory(false)).extracting(HostInventoryResource::id)
                .containsExactly("docker:postgres");
        assertThat(service.inventory(true)).filteredOn(HostInventoryResource::ignored)
                .singleElement()
                .extracting(HostInventoryResource::id)
                .isEqualTo("docker:projectos_other_jellyfin");

        service.unignore("docker:projectos_other_jellyfin");

        assertThat(service.inventory(false)).extracting(HostInventoryResource::id)
                .contains("docker:projectos_other_jellyfin");
    }

    private HostInventoryService service(List<HostDockerContainer> containers) {
        RuntimeLayout runtimeLayout = runtimeLayout();
        HostInventoryIgnoreRepository ignoreRepository = new HostInventoryIgnoreRepository(runtimeLayout);
        DockerOwnershipService ownershipService = new DockerOwnershipService(
                () -> new ProjectOsIdentity("current-instance", "project-os", runtimeRoot.toString(), "runtime-hash", Instant.parse("2026-06-20T12:00:00Z"), 1),
                () -> "0.2.0",
                false);
        return new HostInventoryService(() -> containers, ownershipService, ignoreRepository);
    }

    private RuntimeLayout runtimeLayout() {
        ProjectOsRuntimeProperties properties = new ProjectOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private HostDockerContainer container(String name, String appId, String instanceId, String runtimeHash) {
        return new HostDockerContainer(name, "project-os/" + appId + ":latest", "Up 2 minutes", Map.of(
                DockerOwnershipService.MANAGED, "true",
                DockerOwnershipService.APP_ID, appId,
                DockerOwnershipService.INSTANCE_ID, instanceId,
                DockerOwnershipService.RUNTIME_ROOT_HASH, runtimeHash,
                DockerOwnershipService.APP_INSTANCE_ID, "appinst_" + appId,
                DockerOwnershipService.COMPOSE_PROJECT, name), "0.0.0.0:8080->80/tcp");
    }
}
