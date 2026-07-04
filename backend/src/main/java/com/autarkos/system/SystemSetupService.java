package com.autarkos.system;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.host.ObservedService;
import com.autarkos.host.ObservedServiceService;
import com.autarkos.host.ObservedServiceView;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class SystemSetupService {

    private static final String EXPECTED_USER = "autarkos";
    private static final String DEFAULT_FILEOPS_HELPER = "/opt/autark-os/bin/autark-os-fileops";
    private static final String INSTALL_COMMAND_OVERRIDE = "AUTARK_OS_SETUP_COMMAND";

    private final RuntimeLayout runtimeLayout;
    private final TailscaleService tailscaleService;
    private final Function<List<String>, CommandResult> commandRunner;
    private final boolean devMode;
    private final Environment environment;
    private final Supplier<AutarkOsIdentity> identitySupplier;
    private final Supplier<List<ObservedService>> observedServices;

    @Autowired
    public SystemSetupService(RuntimeLayout runtimeLayout, TailscaleService tailscaleService, @Value("${autark-os.dev-mode:false}") boolean devMode, Environment environment, InstanceIdentityService identityService, ObservedServiceService observedServiceService) {
        this(runtimeLayout, tailscaleService, SystemSetupService::runProcess, devMode, environment, identityService::current, observedServiceService::observedServices);
    }

    SystemSetupService(RuntimeLayout runtimeLayout, TailscaleService tailscaleService, Function<List<String>, CommandResult> commandRunner) {
        this(runtimeLayout, tailscaleService, commandRunner, false, null);
    }

    SystemSetupService(RuntimeLayout runtimeLayout, TailscaleService tailscaleService, Function<List<String>, CommandResult> commandRunner, boolean devMode) {
        this(runtimeLayout, tailscaleService, commandRunner, devMode, null);
    }

    SystemSetupService(RuntimeLayout runtimeLayout, TailscaleService tailscaleService, Function<List<String>, CommandResult> commandRunner, boolean devMode, Environment environment) {
        this(runtimeLayout, tailscaleService, commandRunner, devMode, environment, () -> new AutarkOsIdentity("unknown", "autark-os", "", "", Instant.EPOCH, 1), List::of);
    }

    SystemSetupService(
            RuntimeLayout runtimeLayout,
            TailscaleService tailscaleService,
            Function<List<String>, CommandResult> commandRunner,
            boolean devMode,
            Environment environment,
            Supplier<AutarkOsIdentity> identitySupplier,
            Supplier<List<ObservedService>> observedServices) {
        this.runtimeLayout = runtimeLayout;
        this.tailscaleService = tailscaleService;
        this.commandRunner = commandRunner;
        this.devMode = devMode;
        this.environment = environment;
        this.identitySupplier = identitySupplier;
        this.observedServices = observedServices;
    }

    public SystemSetupModels.SystemSetupStatus status() {
        List<SystemSetupModels.SystemSetupCheck> checks = new ArrayList<>();
        String runAsUser = System.getProperty("user.name", "unknown");
        AutarkOsIdentity identity = identitySupplier.get();
        SystemSetupModels.SystemSetupExistingInstallReport existingInstall = existingInstallReport(identity);
        if (existingInstall.conflict()) {
            checks.add(warn("existing-install", "Existing Autark-OS install", existingInstall.headline(), existingInstall.summary(), "Recover existing apps", "/resolve-existing-apps"));
        } else if (!existingInstall.resources().isEmpty()) {
            checks.add(neutral("existing-install", "Development instance", existingInstall.headline(), existingInstall.summary(), null, null));
        }
        checks.add(serviceUserCheck(runAsUser));
        checks.add(runtimeCheck());
        checks.add(dockerCheck());
        checks.add(fileOpsCheck());
        checks.add(tailscaleCheck());
        checks.add(tailscaleOperatorCheck(runAsUser));
        checks.add(systemdCheck());

        String overall = overall(checks);
        return new SystemSetupModels.SystemSetupStatus(
                overall,
                headline(overall),
                summary(overall),
                runAsUser,
                EXPECTED_USER,
                devMode,
                activeProfiles(),
                property("server.port", "8082"),
                property("server.servlet.context-path", "/"),
                commandVersion("docker", "version", "--format", "{{.Server.Version}}"),
                commandVersion("tailscale", "version"),
                identity.instanceId(),
                identity.instanceSlug(),
                existingInstall,
                installCommand(),
                checks,
                Instant.now());
    }

    private SystemSetupModels.SystemSetupCheck serviceUserCheck(String runAsUser) {
        if (devMode) {
            return neutral(SystemCapabilityCatalog.SERVICE_USER, "Service user", "Dev mode is running as your local user.", "Current user: " + runAsUser, null, null);
        }
        if (EXPECTED_USER.equals(runAsUser)) {
            return ok(SystemCapabilityCatalog.SERVICE_USER, "Service user", "Autark-OS is running as autarkos.", "This is the recommended durable host identity.", null, null);
        }
        return warn(SystemCapabilityCatalog.SERVICE_USER, "Service user", "Autark-OS is not running as the autarkos service user.", "Current user: " + runAsUser, "Run service setup", installCommand());
    }

    private SystemSetupModels.SystemSetupCheck runtimeCheck() {
        Path runtimeRoot = runtimeLayout.runtimeRoot();
        try {
            Files.createDirectories(runtimeRoot);
            if (Files.isWritable(runtimeRoot)) {
                return ok(SystemCapabilityCatalog.RUNTIME_ROOT, "Runtime storage", "Autark-OS can write to its runtime folder.", runtimeRoot.toString(), null, null);
            }
            return warn(SystemCapabilityCatalog.RUNTIME_ROOT, "Runtime storage", "Autark-OS cannot write to its runtime folder.", runtimeRoot.toString(), "Repair permissions", installCommand());
        } catch (IOException exception) {
            return warn(SystemCapabilityCatalog.RUNTIME_ROOT, "Runtime storage", "Autark-OS cannot prepare its runtime folder.", exception.getMessage(), "Repair permissions", installCommand());
        }
    }

    private SystemSetupModels.SystemSetupCheck dockerCheck() {
        CommandResult docker = run("docker", "version", "--format", "{{.Server.Version}}");
        if (docker.exitCode() == 127) {
            return warn(SystemCapabilityCatalog.DOCKER, "Docker", "Docker is not installed.", "Marketplace app installs need Docker.", "Install Docker", null);
        }
        if (docker.successful()) {
            return ok(SystemCapabilityCatalog.DOCKER, "Docker", "Autark-OS can talk to Docker.", firstLine(docker), null, null);
        }
        return warn(SystemCapabilityCatalog.DOCKER, "Docker", "Docker is installed but Autark-OS cannot access it.", firstLine(docker), "Run service setup", installCommand());
    }

    private SystemSetupModels.SystemSetupCheck fileOpsCheck() {
        String helper = fileOpsHelperCommand();
        CommandResult result = run("sudo", "-n", helper, "--help");
        if (result.successful()) {
            String message = devMode
                    ? "Dev mode can use bounded privileged file operations."
                    : "Autark-OS can repair root-owned app data.";
            return ok(SystemCapabilityCatalog.FILEOPS, "File operations", message, "Backups, restores, and app cleanup can use the bounded helper.", null, null);
        }
        if (devMode) {
            return warn(SystemCapabilityCatalog.FILEOPS, "File operations", "Dev mode cannot use privileged file operations.", "Local operations may work, but backups, restores, and cleanup for root-owned app data can fail: " + firstLine(result), "Run service setup", installCommand());
        }
        return warn(SystemCapabilityCatalog.FILEOPS, "File operations", "Autark-OS cannot run bounded file operations yet.", firstLine(result), "Run service setup", installCommand());
    }

    private SystemSetupModels.SystemSetupCheck tailscaleCheck() {
        TailscaleStatus status = tailscaleService.status();
        if (!status.installed()) {
            return warn(SystemCapabilityCatalog.TAILSCALE, "Tailscale", "Tailscale is not installed.", "Private HTTPS app links need Tailscale.", "Install Tailscale", "https://tailscale.com/download");
        }
        if (!status.connected()) {
            return warn(SystemCapabilityCatalog.TAILSCALE, "Tailscale", "Tailscale is installed but not connected.", status.message(), "Connect Tailscale", "tailscale up");
        }
        if (status.dnsName() == null || status.dnsName().isBlank()) {
            return warn(SystemCapabilityCatalog.TAILSCALE, "Tailscale", "Tailscale is connected but MagicDNS is not ready.", "Enable MagicDNS and HTTPS certificates in the Tailscale admin console.", "Open Tailscale admin", "https://login.tailscale.com/admin/dns");
        }
        return ok(SystemCapabilityCatalog.TAILSCALE, "Tailscale", "Tailscale is connected.", status.dnsName(), null, null);
    }

    private SystemSetupModels.SystemSetupCheck tailscaleOperatorCheck(String runAsUser) {
        if (devMode) {
            return ok(SystemCapabilityCatalog.TAILSCALE_OPERATOR, "Tailscale Serve permission", "Dev mode is using mock Tailscale Serve access.", "No real Tailscale Serve command will be run.", null, null);
        }
        if (!tailscaleService.status().connected()) {
            return neutral(SystemCapabilityCatalog.TAILSCALE_OPERATOR, "Tailscale Serve permission", "Waiting for Tailscale connection.", "Connect Tailscale first.", null, null);
        }
        CommandResult serveStatus = run("tailscale", "serve", "status", "--json");
        if (serveStatus.successful()) {
            return ok(SystemCapabilityCatalog.TAILSCALE_OPERATOR, "Tailscale Serve permission", "Autark-OS can inspect Tailscale Serve config.", "Serve management should work for private HTTPS links.", null, null);
        }
        String detail = firstLine(serveStatus);
        String command = "sudo tailscale set --operator=" + runAsUser;
        if (!EXPECTED_USER.equals(runAsUser)) {
            command = "sudo tailscale set --operator=" + EXPECTED_USER;
        }
        return warn(SystemCapabilityCatalog.TAILSCALE_OPERATOR, "Tailscale Serve permission", "Autark-OS cannot manage Tailscale Serve yet.", detail, "Grant Serve permission", command);
    }

    private SystemSetupModels.SystemSetupCheck systemdCheck() {
        if (devMode) {
            return neutral(SystemCapabilityCatalog.SYSTEMD, "System service", "Dev mode is using a local backend process.", "Production should still run through autark-os.service.", null, null);
        }
        CommandResult systemctl = run("systemctl", "is-active", "autark-os");
        if (systemctl.exitCode() == 127) {
            return neutral(SystemCapabilityCatalog.SYSTEMD, "System service", "Systemd is not available.", "This may be expected in dev or container environments.", null, null);
        }
        if (systemctl.successful()) {
            return ok(SystemCapabilityCatalog.SYSTEMD, "System service", "Autark-OS is running as a system service.", "autark-os.service is active.", null, null);
        }
        return warn(SystemCapabilityCatalog.SYSTEMD, "System service", "Autark-OS is not running as a system service.", firstLine(systemctl), "Run service setup", installCommand());
    }

    private String overall(List<SystemSetupModels.SystemSetupCheck> checks) {
        if (checks.stream().anyMatch(SystemCapabilityCatalog::warning)) {
            return "needs_admin_setup";
        }
        if (checks.stream().anyMatch(SystemCapabilityCatalog::neutral)) {
            return "ready_with_notes";
        }
        return "ready";
    }

    private String headline(String status) {
        return switch (status) {
            case "ready" -> "Autark-OS host setup is ready";
            case "ready_with_notes" -> "Autark-OS host setup is mostly ready";
            default -> "Autark-OS needs host setup";
        };
    }

    private String summary(String status) {
        return switch (status) {
            case "ready" -> "This host can manage apps, Docker, and private Tailscale links.";
            case "ready_with_notes" -> "Core setup is working, with a few environment-specific notes.";
            default -> "Run the service-user setup so Autark-OS can manage Docker and private HTTPS links without manual fixes.";
        };
    }

    private SystemSetupModels.SystemSetupCheck ok(String id, String label, String message, String detail, String actionLabel, String actionCommand) {
        return new SystemSetupModels.SystemSetupCheck(id, label, SystemCapabilityCatalog.OK, message, detail, actionLabel, actionCommand);
    }

    private SystemSetupModels.SystemSetupCheck warn(String id, String label, String message, String detail, String actionLabel, String actionCommand) {
        return new SystemSetupModels.SystemSetupCheck(id, label, SystemCapabilityCatalog.WARNING, message, detail, actionLabel, actionCommand);
    }

    private SystemSetupModels.SystemSetupCheck neutral(String id, String label, String message, String detail, String actionLabel, String actionCommand) {
        return new SystemSetupModels.SystemSetupCheck(id, label, SystemCapabilityCatalog.NEUTRAL, message, detail, actionLabel, actionCommand);
    }

    private String installCommand() {
        String override = System.getenv(INSTALL_COMMAND_OVERRIDE);
        if (override != null && !override.isBlank()) {
            return override;
        }
        Path installedScript = Path.of("/opt/autark-os/bin/install-autark-os-service.sh");
        if (Files.isRegularFile(installedScript)) {
            return "sudo " + installedScript;
        }
        Path script = Path.of(System.getProperty("user.dir", "."), "scripts", "install-autark-os-service.sh").toAbsolutePath().normalize();
        return "sudo " + script;
    }

    private CommandResult run(String... command) {
        return commandRunner.apply(Arrays.asList(command));
    }

    private static CommandResult runProcess(List<String> command) {
        SystemCommandRunner.CommandExecutionResult result = new SystemCommandRunner().run(command);
        return new CommandResult(result.exitCode(), result.output());
    }

    private String firstLine(CommandResult result) {
        return result.output().lines().findFirst().orElse("");
    }

    private String activeProfiles() {
        if (environment == null || environment.getActiveProfiles().length == 0) {
            return "default";
        }
        return String.join(", ", environment.getActiveProfiles());
    }

    private String property(String key, String fallback) {
        if (environment == null) {
            return fallback;
        }
        String value = environment.getProperty(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    private String commandVersion(String... command) {
        CommandResult result = run(command);
        if (result.exitCode() == 127) {
            return "not installed";
        }
        if (!result.successful()) {
            return "not available";
        }
        return firstLine(result);
    }

    private String fileOpsHelperCommand() {
        String helper = System.getenv("AUTARK_OS_FILEOPS_HELPER");
        return helper == null || helper.isBlank() ? DEFAULT_FILEOPS_HELPER : helper;
    }

    private SystemSetupModels.SystemSetupExistingInstallReport existingInstallReport(AutarkOsIdentity identity) {
        List<SystemSetupModels.SystemSetupExistingInstallResource> resources = observedServices.get().stream()
                .filter(service -> !"ignored".equals(service.userVisibility()))
                .filter(this::isExistingAutarkOsResource)
                .map(service -> existingResource(service, identity))
                .toList();
        if (resources.isEmpty()) {
            return new SystemSetupModels.SystemSetupExistingInstallReport(
                    false,
                    devMode,
                    "ok",
                    "No existing Autark-OS install found",
                    "Setup did not find another Autark-OS-owned app on this server.",
                    List.of(),
                    List.of());
        }
        if (devMode) {
            return new SystemSetupModels.SystemSetupExistingInstallReport(
                    false,
                    true,
                    "info",
                    "Development instance detected",
                    "Autark-OS found other Autark-OS resources, but this development instance is isolated as " + identity.instanceSlug() + ".",
                    resources,
                    List.of(new SystemSetupModels.SystemSetupAction("review_existing_apps", "Review found apps", "/resolve-existing-apps", "secondary")));
        }
        return new SystemSetupModels.SystemSetupExistingInstallReport(
                true,
                false,
                "warning",
                "Existing Autark-OS install found",
                "Review apps found on this server before creating another production Autark-OS instance.",
                resources,
                List.of(
                        new SystemSetupModels.SystemSetupAction("recover_existing_apps", "Recover existing apps", "/resolve-existing-apps", "primary"),
                        new SystemSetupModels.SystemSetupAction("abort", "Abort setup", "/", "secondary")));
    }

    private boolean isExistingAutarkOsResource(ObservedService service) {
        return "foreign_autark_os".equals(service.ownershipState())
                || "legacy_autark_os".equals(service.ownershipState())
                || "unknown_conflict".equals(service.ownershipState());
    }

    private SystemSetupModels.SystemSetupExistingInstallResource existingResource(ObservedService service, AutarkOsIdentity identity) {
        ObservedServiceView view = ObservedServiceService.toView(service);
        String kind = "legacy_autark_os".equals(service.ownershipState()) ? "recoverable_app" : "autark_os_resource";
        String owner = service.autarkOsInstanceId();
        if (owner == null || owner.isBlank()) {
            owner = identity.instanceId();
        }
        return new SystemSetupModels.SystemSetupExistingInstallResource(
                view.id(),
                view.displayName(),
                kind,
                view.ownershipState(),
                owner,
                view.userStatusDescription(),
                "/resolve-existing-apps");
    }

    record CommandResult(int exitCode, String output) {
        private boolean successful() {
            return exitCode == 0;
        }
    }
}
