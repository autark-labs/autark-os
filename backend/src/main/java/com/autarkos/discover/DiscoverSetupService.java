package com.autarkos.discover;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.autarkos.marketplace.model.ApplicationManifest;

import org.springframework.stereotype.Service;

@Service
public class DiscoverSetupService {

    private final DiscoverSetupRepository setupRepository;

    public DiscoverSetupService(DiscoverSetupRepository setupRepository) {
        this.setupRepository = setupRepository;
    }

    public DiscoverSetupModels.DiscoverSetupSchema schema(ApplicationManifest manifest) {
        List<DiscoverSetupModels.DiscoverSetupInput> inputs = new ArrayList<>();
        inputs.add(new DiscoverSetupModels.DiscoverSetupInput(
                "displayName",
                "App name",
                "text",
                "required",
                true,
                manifest.name(),
                "This is the friendly name Autark-OS shows in My Apps and Home.",
                List.of(),
                Map.of()));
        inputs.add(new DiscoverSetupModels.DiscoverSetupInput(
                "accessMode",
                "Access",
                "choice",
                "recommended",
                true,
                manifest.access().privateAccessRecommended() ? "private_lan" : "lan_only",
                "Choose where the app can be opened from. Private access means trusted Tailscale devices can open the app away from home.",
                accessOptions(),
                Map.of()));
        inputs.add(new DiscoverSetupModels.DiscoverSetupInput(
                "storageMode",
                "Storage",
                "choice",
                "recommended",
                true,
                "autark_os_default",
                "Autark-OS managed storage keeps app files in a predictable folder so backups, restores, and cleanup work safely.",
                storageOptions(),
                Map.of()));
        inputs.add(new DiscoverSetupModels.DiscoverSetupInput(
                "backupPolicy",
                "Backups",
                "choice",
                "recommended",
                true,
                "enabled_first_checkpoint",
                "Backups save app data so you can recover after a bad update, mistake, or broken install.",
                backupOptions(),
                Map.of()));
        inputs.addAll(appSpecificInputs(manifest));
        inputs.add(new DiscoverSetupModels.DiscoverSetupInput(
                "localBrowserPort",
                "Local browser port",
                "number-or-auto",
                "advanced",
                false,
                "auto",
                "Leave this on Auto unless another service already uses the suggested port.",
                List.of(),
                Map.of()));
        return new DiscoverSetupModels.DiscoverSetupSchema(manifest.id(), 1, inputs);
    }

    public DiscoverSetupModels.DiscoverSetupAnswers defaults(ApplicationManifest manifest) {
        return new DiscoverSetupModels.DiscoverSetupAnswers(schema(manifest).inputs().stream()
                .collect(java.util.stream.Collectors.toMap(
                        DiscoverSetupModels.DiscoverSetupInput::id,
                        input -> input.defaultValue() == null ? "" : input.defaultValue(),
                        (left, right) -> right,
                        java.util.LinkedHashMap::new)));
    }

    public DiscoverSetupModels.DiscoverSetupAnswers mergedAnswers(ApplicationManifest manifest, DiscoverSetupModels.DiscoverSetupAnswersRequest request) {
        java.util.LinkedHashMap<String, Object> values = new java.util.LinkedHashMap<>(defaults(manifest).values());
        values.putAll(request == null ? Map.of() : request.setupAnswers().values());
        return new DiscoverSetupModels.DiscoverSetupAnswers(values);
    }

    public void persist(String appId, String catalogAppId, DiscoverSetupModels.DiscoverSetupAnswers answers) {
        setupRepository.save(appId, catalogAppId, answers);
    }

    private List<DiscoverSetupModels.DiscoverSetupInput> appSpecificInputs(ApplicationManifest manifest) {
        return switch (manifest.id()) {
            case "grafana" -> List.of(new DiscoverSetupModels.DiscoverSetupInput(
                    "grafanaDataSource",
                    "Dashboard source",
                    "choice",
                    "app_specific",
                    true,
                    "start_empty",
                    "Grafana needs a data source before dashboards show useful information. You can start empty and add one later.",
                    List.of(
                            option("start_empty", "Start empty", "Open Grafana with no preselected data source.", true, false),
                            option("prometheus_if_installed", "Connect Prometheus if installed", "Prepare a Prometheus data-source suggestion when Prometheus is installed.", false, false),
                            option("later", "Add data source later", "Install Grafana now and connect a data source from inside Grafana.", false, false)),
                    Map.of()));
            case "jellyfin" -> List.of(
                    new DiscoverSetupModels.DiscoverSetupInput(
                            "jellyfinMediaFolder",
                            "Media folder",
                            "choice",
                            "app_specific",
                            true,
                            "create_new",
                            "Jellyfin needs a folder where your movies, shows, music, or home videos live.",
                            List.of(
                                    option("create_new", "Create a new media folder", "Autark-OS prepares an empty folder for Jellyfin.", true, false),
                                    option("existing_folder", "Use an existing folder", "Autark-OS validates the existing folder before install.", false, false),
                                    option("later", "Choose later", "Install Jellyfin first and add libraries later.", false, false)),
                            Map.of()),
                    new DiscoverSetupModels.DiscoverSetupInput(
                            "jellyfinExistingMediaPath",
                            "Existing media folder path",
                            "path",
                            "app_specific",
                            true,
                            "",
                            "Use the host folder path that contains your media files.",
                            List.of(),
                            Map.of("jellyfinMediaFolder", "existing_folder")));
            case "pi-hole" -> List.of(
                    new DiscoverSetupModels.DiscoverSetupInput(
                            "piholeDnsProvider",
                            "Upstream DNS provider",
                            "choice",
                            "app_specific",
                            true,
                            "cloudflare",
                            "Upstream DNS is where Pi-hole sends requests after filtering ads and trackers.",
                            List.of(
                                    option("cloudflare", "Cloudflare", "Use 1.1.1.1 and 1.0.0.1.", true, false),
                                    option("quad9", "Quad9", "Use 9.9.9.9 and 149.112.112.112.", false, false),
                                    option("google", "Google", "Use 8.8.8.8 and 8.8.4.4.", false, false),
                                    option("custom", "Custom provider", "Enter your own upstream DNS servers.", false, false)),
                            Map.of()),
                    new DiscoverSetupModels.DiscoverSetupInput(
                            "piholeCustomDns",
                            "Custom DNS servers",
                            "text",
                            "app_specific",
                            true,
                            "",
                            "Separate multiple DNS server IP addresses with commas.",
                            List.of(),
                            Map.of("piholeDnsProvider", "custom")));
            default -> List.of();
        };
    }

    private List<DiscoverSetupModels.DiscoverSetupOption> accessOptions() {
        return List.of(
                option("private_lan", "Private + home network", "Available on your home network and to trusted Tailscale devices.", true, false),
                option("lan_only", "Home network only", "Available only to devices on your home network.", false, false),
                option("local_only", "This server only", "Useful for internal tools that should not be exposed.", false, false));
    }

    private List<DiscoverSetupModels.DiscoverSetupOption> storageOptions() {
        return List.of(
                option("autark_os_default", "Autark-OS managed storage", "Use the default managed app folders.", true, false),
                option("existing_folder", "Use an existing folder", "Review an existing folder before Autark-OS treats it as app data.", false, true));
    }

    private List<DiscoverSetupModels.DiscoverSetupOption> backupOptions() {
        return List.of(
                option("enabled_first_checkpoint", "Enable backups and create first restore point", "Include the app in backups and recommend a first restore point after install.", true, false),
                option("enabled_no_checkpoint", "Enable backups, create restore point later", "Include the app in backups without a first-checkpoint reminder.", false, false),
                option("disabled", "Do not back up this app", "Skip backup protection for now.", false, true));
    }

    private DiscoverSetupModels.DiscoverSetupOption option(String value, String label, String description, boolean recommended, boolean advanced) {
        return new DiscoverSetupModels.DiscoverSetupOption(value, label, description, recommended, advanced);
    }
}
