package com.projectos.host;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/dev")
public class DevHostInventoryController {

    private final boolean devMode;

    public DevHostInventoryController(@Value("${project-os.dev-mode:false}") boolean devMode) {
        this.devMode = devMode;
    }

    @GetMapping("/host-inventory-fixture")
    public List<HostInventoryResource> fixture() {
        if (!devMode) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dev host inventory fixtures are only available in development mode.");
        }
        return List.of(
                resource("docker:owned-vaultwarden", "Vaultwarden", "vaultwarden", "owned_managed", "managed", false, "low"),
                resource("docker:foreign-jellyfin", "Jellyfin", "jellyfin", "foreign_project_os", "observed", false, "high"),
                resource("docker:legacy-homepage", "Homepage", "homepage", "legacy_project_os", "recoverable", false, "medium"),
                resource("docker:postgres", "postgres", "", "external_docker", "observed", false, "info"),
                resource("docker:ignored-paperless", "Paperless", "paperless", "external_docker", "observed", true, "info"),
                resource("docker:blocked-port", "Blocked port 8080", "", "unknown_conflict", "conflict", false, "high"));
    }

    private HostInventoryResource resource(String id, String name, String appId, String ownership, String mode, boolean ignored, String risk) {
        return new HostInventoryResource(
                id,
                name,
                appId,
                ownership,
                mode,
                ownership.equals("foreign_project_os") ? "other-instance" : "",
                "current-instance",
                ownership.equals("unknown_conflict") ? "blocked" : "running",
                List.of("http://localhost:8080"),
                "fixture",
                List.of("view_details", "open", ignored ? "unignore" : "ignore"),
                ignored,
                risk,
                name + " fixture resource.",
                Map.of("containerName", id.replace("docker:", "")));
    }
}
