package com.projectos.system;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.projectos.marketplace.runtime.RuntimeLayout;

@Service
public class SystemDoctorService {

    private final SystemSetupService setupService;
    private final ProjectSettingsRepository settingsRepository;
    private final RuntimeLayout runtimeLayout;

    public SystemDoctorService(SystemSetupService setupService, ProjectSettingsRepository settingsRepository, RuntimeLayout runtimeLayout) {
        this.setupService = setupService;
        this.settingsRepository = settingsRepository;
        this.runtimeLayout = runtimeLayout;
    }

    public SystemDoctorStatus status() {
        SystemSetupStatus setup = setupService.status();
        List<SystemSetupCheck> checks = new ArrayList<>(setup.checks());
        checks.add(internetCheck());
        checks.add(backupDestinationCheck());
        List<SystemSetupCheck> repairable = checks.stream()
                .filter(check -> check.actionCommand() != null && !check.actionCommand().isBlank())
                .toList();
        boolean supported = automatedDependencyInstallSupported();
        SystemReadinessStatus readiness = readiness(checks);
        String status = readiness.canCompleteOnboarding() && !readiness.finishAnywayRequiresAdvanced() ? "ready" : "needs_attention";
        return new SystemDoctorStatus(
                status,
                readiness.headline(),
                readiness.summary(),
                readiness,
                checks,
                repairable,
                detectedOs(),
                packageManager(),
                supported,
                lanUrl(setup.backendPort()),
                Instant.now());
    }

    public SystemDoctorStatus repairSupported() {
        return status();
    }

    private SystemSetupCheck internetCheck() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("tailscale.com", 443), 1800);
            return new SystemSetupCheck(SystemCapabilityCatalog.INTERNET, "Internet", SystemCapabilityCatalog.OK, "This device can reach the internet.", "DNS and outbound HTTPS checks passed.", null, null);
        } catch (Exception exception) {
            return new SystemSetupCheck(SystemCapabilityCatalog.INTERNET, "Internet", SystemCapabilityCatalog.WARNING, "Internet access could not be confirmed.", exception.getMessage(), "Check network", null);
        }
    }

    private SystemSetupCheck backupDestinationCheck() {
        String defaultDestination = runtimeLayout.runtimeRoot().resolve("backups").toAbsolutePath().normalize().toString();
        String destination = settingsRepository.backupDestination(runtimeLayout.runtimeRoot().resolve("backups")).toString();
        boolean external = !destination.equals(defaultDestination);
        String message = external ? "Routine backups use your selected backup folder." : "Routine backups use the Project OS runtime drive.";
        String detail = external ? destination : "Same-device backups help with app mistakes, but they do not protect against drive failure.";
        return new SystemSetupCheck(SystemCapabilityCatalog.BACKUP_DESTINATION, "Backup destination", SystemCapabilityCatalog.NEUTRAL, message, detail, "Open Backups", "/backups");
    }

    private SystemReadinessStatus readiness(List<SystemSetupCheck> checks) {
        SystemReadinessGroup core = group("core", "Project OS", "Project OS can open and save settings.", checks, SystemCapabilityCatalog.CORE_CHECKS);
        SystemReadinessGroup appInstalls = group("app-installs", "App installs", "Docker is ready for Marketplace apps.", checks, SystemCapabilityCatalog.APP_INSTALL_CHECKS);
        SystemReadinessGroup privateAccess = group("private-access", "Private access", "Tailscale is ready for private app links.", checks, SystemCapabilityCatalog.PRIVATE_ACCESS_CHECKS);
        SystemReadinessGroup storage = group("storage", "Storage", "Storage and backup locations are ready.", checks, SystemCapabilityCatalog.STORAGE_CHECKS);
        SystemReadinessGroup warnings = group("warnings", "Other checks", "Network and service notes are ready.", checks, SystemCapabilityCatalog.WARNING_CHECKS);
        List<SystemReadinessGroup> groups = List.of(core, appInstalls, privateAccess, storage, warnings);

        if (SystemCapabilityCatalog.WARNING.equals(core.status())) {
            return new SystemReadinessStatus(
                    "storage_needs_review",
                    "Storage needs review",
                    "Project OS needs writable storage before setup can be completed.",
                    false,
                    false,
                    groups);
        }
        if (SystemCapabilityCatalog.WARNING.equals(storage.status())) {
            return new SystemReadinessStatus(
                    "storage_needs_review",
                    "Storage needs review",
                    "Review storage and backup warnings before relying on this device.",
                    false,
                    false,
                    groups);
        }
        if (SystemCapabilityCatalog.WARNING.equals(appInstalls.status())) {
            return new SystemReadinessStatus(
                    "apps_need_docker",
                    "Apps need Docker setup",
                    "Project OS can finish setup, but Marketplace app installs need Docker access first.",
                    true,
                    true,
                    groups);
        }
        if (SystemCapabilityCatalog.WARNING.equals(privateAccess.status())) {
            return new SystemReadinessStatus(
                    "private_access_needs_tailscale",
                    "Private access needs Tailscale setup",
                    "Local access can work now. Set up Tailscale when you want private app links.",
                    true,
                    true,
                    groups);
        }
        if (SystemCapabilityCatalog.WARNING.equals(warnings.status())) {
            return new SystemReadinessStatus(
                    "warnings_only",
                    "Ready with notes",
                    "Core setup is ready, with a few items to review later.",
                    true,
                    true,
                    groups);
        }
        return new SystemReadinessStatus(
                "ready",
                "Ready",
                "Project OS can manage apps, backups, and private access.",
                true,
                false,
                groups);
    }

    private SystemReadinessGroup group(String id, String label, String readyMessage, List<SystemSetupCheck> checks, List<String> checkIds) {
        List<SystemSetupCheck> groupChecks = checks.stream()
                .filter(check -> checkIds.contains(check.id()))
                .toList();
        String status = groupChecks.stream().anyMatch(SystemCapabilityCatalog::warning)
                ? SystemCapabilityCatalog.WARNING
                : groupChecks.stream().anyMatch(SystemCapabilityCatalog::neutral) ? SystemCapabilityCatalog.NEUTRAL : SystemCapabilityCatalog.OK;
        String message = groupChecks.stream()
                .filter(SystemCapabilityCatalog::warning)
                .findFirst()
                .map(SystemSetupCheck::message)
                .orElse(readyMessage);
        return new SystemReadinessGroup(id, label, status, message, groupChecks);
    }

    private boolean automatedDependencyInstallSupported() {
        return packageManager().equals("apt");
    }

    private String packageManager() {
        if (java.nio.file.Files.isExecutable(java.nio.file.Path.of("/usr/bin/apt-get"))) {
            return "apt";
        }
        return "unsupported";
    }

    private String detectedOs() {
        try {
            return java.nio.file.Files.readString(java.nio.file.Path.of("/etc/os-release")).lines()
                    .filter(line -> line.startsWith("PRETTY_NAME="))
                    .findFirst()
                    .map(line -> line.substring("PRETTY_NAME=".length()).replace("\"", ""))
                    .orElse(System.getProperty("os.name", "Linux"));
        } catch (Exception exception) {
            return System.getProperty("os.name", "Linux");
        }
    }

    private String lanUrl(String port) {
        return "http://" + lanAddress() + ":" + (port == null || port.isBlank() ? "8082" : port);
    }

    private String lanAddress() {
        try {
            var interfaces = NetworkInterface.networkInterfaces().toList();
            for (NetworkInterface networkInterface : interfaces) {
                if (!networkInterface.isUp() || networkInterface.isLoopback()) {
                    continue;
                }
                var addresses = networkInterface.inetAddresses().toList();
                for (InetAddress address : addresses) {
                    if (address instanceof java.net.Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
            return "localhost";
        }
        return "localhost";
    }
}
