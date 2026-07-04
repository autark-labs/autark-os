package com.autarkos.discover;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.models.InstallModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.plan.InstallPlan;
import com.autarkos.marketplace.plan.InstallPlanService;

@Service
public class DiscoverInstallPreviewService {

    private final InstallPlanService installPlanService;
    private final DiscoverSetupService setupService;

    public DiscoverInstallPreviewService(InstallPlanService installPlanService, DiscoverSetupService setupService) {
        this.installPlanService = installPlanService;
        this.setupService = setupService;
    }

    public DiscoverInstallModels.DiscoverInstallPreview preview(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswersRequest request) {
        DiscoverSetupModels.DiscoverSetupAnswers answers = setupService.mergedAnswers(manifest, request);
        List<DiscoverInstallModels.DiscoverInstallIssue> issues = validate(manifest, answers);
        List<DiscoverInstallModels.DiscoverInstallIssue> blockingIssues = issues.stream().filter(issue -> "error".equals(issue.severity())).toList();
        List<DiscoverInstallModels.DiscoverInstallIssue> warnings = new ArrayList<>(issues.stream().filter(issue -> !"error".equals(issue.severity())).toList());
        if ("disabled".equals(answers.stringValue("backupPolicy"))) {
            warnings.add(new DiscoverInstallModels.DiscoverInstallIssue("backupPolicy", "warning", manifest.name() + " will not be included in Autark-OS backups until you enable it."));
        }
        InstallOptionsRequest options = installOptions(manifest, answers);
        InstallPlan technicalPlan = installPlanService.generatePlan(manifest, blockingIssues.isEmpty() ? options : InstallOptionsRequest.defaults());
        return new DiscoverInstallModels.DiscoverInstallPreview(
                blockingIssues.isEmpty(),
                blockingIssues,
                warnings,
                sections(manifest, answers),
                technicalPlan,
                options);
    }

    public InstallOptionsRequest installOptions(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        Integer hostPort = hostPort(answers.value("localBrowserPort"));
        boolean tailscale = "private_lan".equals(answers.stringValue("accessMode"));
        boolean backupEnabled = !"disabled".equals(answers.stringValue("backupPolicy"));
        return new InstallOptionsRequest(
                new InstallOptionsRequest.PortOptions(hostPort),
                new InstallOptionsRequest.AccessOptions(tailscale),
                new InstallOptionsRequest.StorageOptions(storageSubfolders(manifest, answers), storageHostPaths(manifest, answers)),
                new InstallOptionsRequest.BackupOptions(backupEnabled, "daily", 7));
    }

    public List<DiscoverInstallModels.DiscoverInstallIssue> validate(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        List<DiscoverInstallModels.DiscoverInstallIssue> issues = new ArrayList<>();
        if (answers.stringValue("displayName").isBlank()) {
            issues.add(error("displayName", "Give this app a name before installing it."));
        }
        Object port = answers.value("localBrowserPort");
        if (port != null && !"".equals(String.valueOf(port).trim()) && !"auto".equals(String.valueOf(port).trim())) {
            Integer numericPort = hostPort(port);
            if (numericPort == null || numericPort < 1 || numericPort > 65535) {
                issues.add(error("localBrowserPort", "Use Auto or a port from 1 to 65535."));
            }
        }
        if ("jellyfin".equals(manifest.id()) && "existing_folder".equals(answers.stringValue("jellyfinMediaFolder"))) {
            String path = answers.stringValue("jellyfinExistingMediaPath");
            if (path.isBlank()) {
                issues.add(error("jellyfinExistingMediaPath", "Choose the media folder path to connect after install."));
            } else {
                Path mediaPath = Path.of(path);
                if (!Files.isDirectory(mediaPath) || !Files.isReadable(mediaPath)) {
                    issues.add(error("jellyfinExistingMediaPath", "Choose a media folder that exists and can be read by Autark-OS."));
                }
            }
        }
        if ("pi-hole".equals(manifest.id()) && "custom".equals(answers.stringValue("piholeDnsProvider")) && !validDnsList(answers.stringValue("piholeCustomDns"))) {
            issues.add(error("piholeCustomDns", "Enter one or more DNS server IP addresses, separated by commas."));
        }
        if ("existing_folder".equals(answers.stringValue("storageMode")) && !"jellyfin".equals(manifest.id())) {
            issues.add(new DiscoverInstallModels.DiscoverInstallIssue("storageMode", "warning", "Existing folders need a review before Autark-OS treats them as protected app data."));
        }
        return issues;
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewSection> sections(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        return List.of(
                new DiscoverInstallModels.DiscoverInstallPreviewSection("create", "Create", createItems(manifest, answers)),
                new DiscoverInstallModels.DiscoverInstallPreviewSection("connect", "Connect", connectItems(answers)),
                new DiscoverInstallModels.DiscoverInstallPreviewSection("protect", "Protect", protectItems(manifest, answers)),
                new DiscoverInstallModels.DiscoverInstallPreviewSection("check", "Check", checkItems(manifest, answers)),
                new DiscoverInstallModels.DiscoverInstallPreviewSection("afterInstall", "After install", afterInstallItems(manifest, answers)));
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewItem> createItems(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        List<DiscoverInstallModels.DiscoverInstallPreviewItem> items = new ArrayList<>();
        items.add(item("Create " + answers.stringValue("displayName") + " as a managed Autark-OS app.", null, "default"));
        items.add(item("Create managed folders for app data.", "Autark-OS uses predictable app folders for recovery and cleanup.", "default"));
        if ("jellyfin".equals(manifest.id())) {
            if ("existing_folder".equals(answers.stringValue("jellyfinMediaFolder"))) {
                items.add(item("Connect the existing media folder after validating it.", answers.stringValue("jellyfinExistingMediaPath"), "default"));
            } else if ("create_new".equals(answers.stringValue("jellyfinMediaFolder"))) {
                items.add(item("Create an empty media folder for Jellyfin.", null, "default"));
            }
        }
        return items;
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewItem> connectItems(DiscoverSetupModels.DiscoverSetupAnswers answers) {
        return switch (answers.stringValue("accessMode")) {
            case "private_lan" -> List.of(item("Create a home network link and request private Tailscale access.", null, "default"));
            case "local_only" -> List.of(item("Keep access limited to this server until you change it later.", null, "warning"));
            default -> List.of(item("Create a home network link for devices on your LAN.", null, "default"));
        };
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewItem> protectItems(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        if ("disabled".equals(answers.stringValue("backupPolicy"))) {
            return List.of(item("Do not include " + manifest.name() + " in Autark-OS backups yet.", "You can enable backups later.", "warning"));
        }
        if ("enabled_no_checkpoint".equals(answers.stringValue("backupPolicy"))) {
            return List.of(item("Include " + manifest.name() + " in routine Autark-OS backups.", null, "success"));
        }
        return List.of(item("Include " + manifest.name() + " in backups and recommend a first restore point.", null, "success"));
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewItem> checkItems(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        List<DiscoverInstallModels.DiscoverInstallPreviewItem> items = new ArrayList<>();
        items.add(item("Start the app and wait for: " + manifest.health().successLabel(), manifest.health().description(), "default"));
        Integer port = hostPort(answers.value("localBrowserPort"));
        if (port != null) {
            items.add(item("Use local port " + port + ".", null, "default"));
        }
        if ("grafana".equals(manifest.id()) && "prometheus_if_installed".equals(answers.stringValue("grafanaDataSource"))) {
            items.add(item("Look for Prometheus before suggesting a first data source.", null, "default"));
        }
        if ("pi-hole".equals(manifest.id())) {
            items.add(item("Use " + dnsProviderLabel(answers) + " as upstream DNS.", null, "default"));
        }
        return items;
    }

    private List<DiscoverInstallModels.DiscoverInstallPreviewItem> afterInstallItems(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        List<DiscoverInstallModels.DiscoverInstallPreviewItem> items = new ArrayList<>();
        items.add(item("Open " + manifest.name() + " from My Apps.", null, "default"));
        if ("enabled_first_checkpoint".equals(answers.stringValue("backupPolicy"))) {
            items.add(item("Create a first restore point before making major changes.", null, "success"));
        }
        if ("grafana".equals(manifest.id()) && "start_empty".equals(answers.stringValue("grafanaDataSource"))) {
            items.add(item("Open Grafana and add a data source before dashboards show metrics.", null, "default"));
        }
        return items;
    }

    private Map<String, String> storageSubfolders(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        java.util.LinkedHashMap<String, String> subfolders = new java.util.LinkedHashMap<>();
        if ("jellyfin".equals(manifest.id()) && "create_new".equals(answers.stringValue("jellyfinMediaFolder"))) {
            subfolders.put("media", "media");
        }
        return subfolders;
    }

    private Map<String, String> storageHostPaths(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        if ("jellyfin".equals(manifest.id()) && "existing_folder".equals(answers.stringValue("jellyfinMediaFolder"))) {
            return Map.of("media", answers.stringValue("jellyfinExistingMediaPath"));
        }
        return Map.of();
    }

    private DiscoverInstallModels.DiscoverInstallPreviewItem item(String label, String description, String tone) {
        return new DiscoverInstallModels.DiscoverInstallPreviewItem(label, description, tone);
    }

    private DiscoverInstallModels.DiscoverInstallIssue error(String fieldId, String message) {
        return new DiscoverInstallModels.DiscoverInstallIssue(fieldId, "error", message);
    }

    private Integer hostPort(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        if (text.isBlank() || "auto".equalsIgnoreCase(text)) {
            return null;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private boolean validDnsList(String value) {
        List<String> servers = java.util.Arrays.stream(value.split(",")).map(String::trim).filter(server -> !server.isBlank()).toList();
        return !servers.isEmpty() && servers.stream().allMatch(this::validIpAddress);
    }

    private boolean validIpAddress(String value) {
        String[] parts = value.split("\\.");
        if (parts.length != 4) {
            return false;
        }
        for (String part : parts) {
            try {
                int number = Integer.parseInt(part);
                if (number < 0 || number > 255) {
                    return false;
                }
            } catch (NumberFormatException exception) {
                return false;
            }
        }
        return true;
    }

    private String dnsProviderLabel(DiscoverSetupModels.DiscoverSetupAnswers answers) {
        return switch (answers.stringValue("piholeDnsProvider")) {
            case "quad9" -> "Quad9";
            case "google" -> "Google";
            case "custom" -> answers.stringValue("piholeCustomDns");
            default -> "Cloudflare";
        };
    }
}
