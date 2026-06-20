package com.projectos.system;

import java.util.List;

public final class SystemCapabilityCatalog {

    public static final String SERVICE_USER = "service-user";
    public static final String RUNTIME_ROOT = "runtime-root";
    public static final String DOCKER = "docker";
    public static final String TAILSCALE = "tailscale";
    public static final String TAILSCALE_OPERATOR = "tailscale-operator";
    public static final String SYSTEMD = "systemd";
    public static final String INTERNET = "internet";
    public static final String BACKUP_DESTINATION = "backup-destination";

    public static final String OK = "ok";
    public static final String WARNING = "warning";
    public static final String NEUTRAL = "neutral";

    public static final List<String> CORE_CHECKS = List.of(RUNTIME_ROOT);
    public static final List<String> APP_INSTALL_CHECKS = List.of(DOCKER, SERVICE_USER);
    public static final List<String> PRIVATE_ACCESS_CHECKS = List.of(TAILSCALE, TAILSCALE_OPERATOR);
    public static final List<String> STORAGE_CHECKS = List.of(BACKUP_DESTINATION);
    public static final List<String> WARNING_CHECKS = List.of(INTERNET, SYSTEMD);

    private SystemCapabilityCatalog() {
    }

    public static String supportRoute(String id) {
        return switch (id) {
            case TAILSCALE, TAILSCALE_OPERATOR -> "/network";
            case BACKUP_DESTINATION -> "/backups";
            case DOCKER, SYSTEMD, SERVICE_USER, RUNTIME_ROOT -> "/settings";
            default -> "/settings";
        };
    }

    public static boolean warning(SystemSetupCheck check) {
        return WARNING.equals(check.status());
    }

    public static boolean neutral(SystemSetupCheck check) {
        return NEUTRAL.equals(check.status());
    }
}
