package com.autarkos.marketplace.plan;

import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.marketplace.install.InstallCustomizationResolver;
import com.autarkos.marketplace.install.RuntimeModels;
import com.autarkos.marketplace.model.ApplicationManifest;
import com.autarkos.marketplace.model.RuntimeServiceManifest;
import com.autarkos.marketplace.runtime.RuntimeLayout;

@Service
public class InstallPlanService {

    private final RuntimeLayout runtimeLayout;
    private final InstallCustomizationResolver customizationResolver;

    public InstallPlanService(RuntimeLayout runtimeLayout, InstallCustomizationResolver customizationResolver) {
        this.runtimeLayout = runtimeLayout;
        this.customizationResolver = customizationResolver;
    }

    public InstallPlan generatePlan(ApplicationManifest manifest) {
        return generatePlan(manifest, InstallOptionsRequest.defaults());
    }

    public InstallPlan generatePlan(ApplicationManifest manifest, InstallOptionsRequest options) {
        RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration = customizationResolver.resolve(manifest, options);
        FriendlyInstallPlan friendly = new FriendlyInstallPlan(
                manifest.name() + " will be prepared with Autark-OS managed storage, networking, access, and backups.",
                manifest.installTime(),
                manifest.bestFor(),
                List.of("A protected runtime folder for " + manifest.name(), "Managed config and data directories"),
                plannedContainers(manifest).stream().map(PlannedContainer::image).toList(),
                runtimeConfiguration.ports().isEmpty() ? List.of("No public ports declared") : List.of(runtimeConfiguration.accessUrl(), "Local ports: " + String.join(", ", runtimeConfiguration.ports())),
                List.of("Autark-OS labels", runtimeConfiguration.tailscaleEnabled() ? "Tailscale access requested" : "Local browser access", "Health check metadata"),
                runtimeConfiguration.backup().enabled() ? List.of(runtimeConfiguration.backup().label()) : List.of("Backups disabled"));

        TechnicalInstallPlan technical = new TechnicalInstallPlan(
                runtimeLayout.appRoot(manifest.id()).toString(),
                manifest.runtime().composeProject(),
                plannedContainers(manifest),
                manifest.runtime().network(),
                runtimeConfiguration.ports(),
                effectiveVolumes(manifest, runtimeConfiguration),
                effectiveLabels(manifest),
                manifest.runtime().backupPaths());

        return new InstallPlan(
                manifest.id(),
                manifest.name(),
                friendly,
                technical,
                new InstallCustomizationSummary(
                        runtimeConfiguration.accessUrl(),
                        runtimeConfiguration.tailscaleEnabled(),
                        runtimeConfiguration.storageSubfolders(),
                        runtimeConfiguration.storageHostPaths(),
                        runtimeConfiguration.backup()),
                warnings(manifest, runtimeConfiguration));
    }

    private List<String> effectiveVolumes(ApplicationManifest manifest, RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration) {
        return declaredVolumes(manifest)
                .map(volume -> rewriteVolume(manifest, volume, runtimeConfiguration))
                .toList();
    }

    private List<PlannedContainer> plannedContainers(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return List.of(new PlannedContainer(manifest.runtime().containerName(), manifest.runtime().image()));
        }
        return manifest.runtime().services().stream()
                .map(service -> new PlannedContainer(service.containerName(), service.image()))
                .toList();
    }

    private Stream<String> declaredVolumes(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return manifest.runtime().volumes().stream();
        }
        return manifest.runtime().services().stream().flatMap(service -> service.volumes().stream());
    }

    private List<String> effectiveLabels(ApplicationManifest manifest) {
        if (!manifest.runtime().multiService()) {
            return manifest.runtime().labels();
        }
        return Stream.concat(
                        manifest.runtime().labels().stream(),
                        manifest.runtime().services().stream().flatMap(service -> service.labels().stream()))
                .distinct()
                .toList();
    }

    private String rewriteVolume(ApplicationManifest manifest, String volume, RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration) {
        String[] parts = volume.split(":", 2);
        if (parts.length != 2) {
            return volume;
        }
        String relative = parts[0].replace(manifest.runtime().runtimeRoot(), "");
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        if (runtimeConfiguration.storageHostPaths().containsKey(relative)) {
            return runtimeConfiguration.storageHostPaths().get(relative) + ":" + parts[1];
        }
        relative = runtimeConfiguration.storageSubfolders().getOrDefault(relative, relative);
        return runtimeLayout.appPath(manifest.id(), relative) + ":" + parts[1];
    }

    private List<String> warnings(ApplicationManifest manifest, RuntimeModels.ResolvedRuntimeConfiguration runtimeConfiguration) {
        java.util.ArrayList<String> warnings = new java.util.ArrayList<>();
        if (manifest.runtime().network().equalsIgnoreCase("host")) {
            warnings.add("This app uses host networking so devices on your local network can discover it.");
        }
        if (runtimeConfiguration.tailscaleEnabled()) {
            warnings.add("Autark-OS will attempt to create a private Tailscale HTTPS link during install.");
        }
        if (!runtimeConfiguration.backup().enabled()) {
            warnings.add("Backups are disabled for this install.");
        }
        return warnings;
    }
}
