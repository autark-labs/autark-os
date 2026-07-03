package com.projectos.network.diagnostics;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.projectos.apps.ApplicationStateService;
import com.projectos.marketplace.install.AppAccessCheck;
import com.projectos.marketplace.install.AppLifecycleService;
import com.projectos.marketplace.install.AppRuntimeView;
import com.projectos.marketplace.install.PrivateAccessReconciliationItem;
import com.projectos.marketplace.install.PrivateAccessReconciliationReport;
import com.projectos.marketplace.install.PrivateAccessReconciliationService;
import com.projectos.network.tailscale.TailscaleDevice;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.network.tailscale.TailscaleStatus;

@Service
public class NetworkDiagnosticsService {

    private final TailscaleService tailscaleService;
    private final ApplicationStateService applicationStateService;
    private final AppLifecycleService appLifecycleService;
    private final PrivateAccessReconciliationService reconciliationService;

    public NetworkDiagnosticsService(TailscaleService tailscaleService, ApplicationStateService applicationStateService, AppLifecycleService appLifecycleService, PrivateAccessReconciliationService reconciliationService) {
        this.tailscaleService = tailscaleService;
        this.applicationStateService = applicationStateService;
        this.appLifecycleService = appLifecycleService;
        this.reconciliationService = reconciliationService;
    }

    public NetworkDiagnosticsReport report() {
        TailscaleStatus tailscale = tailscaleService.status();
        List<TailscaleDevice> devices = tailscaleService.devices();
        List<AppRuntimeView> apps = applicationStateService.snapshot().runtimeApps();
        Map<String, AppAccessCheck> accessChecks = cachedAccessChecks(apps);
        List<AppRuntimeView> privateApps = apps.stream()
                .filter(app -> app.settings() != null && app.settings().tailscaleEnabled())
                .toList();

        List<NetworkDiagnosticItem> checks = new ArrayList<>();
        checks.add(installedCheck(tailscale));
        checks.add(connectedCheck(tailscale));
        checks.add(dnsCheck(tailscale));
        checks.add(devicesCheck(tailscale, devices));
        checks.add(connectionPathCheck(devices));
        checks.add(privateAppsCheck(tailscale, apps, privateApps));

        List<NetworkDiagnosticItem> appChecks = privateApps.stream()
                .map(app -> appCheck(app, accessChecks.get(app.appId()), tailscale))
                .toList();
        PrivateAccessReconciliationReport reconciliation = reconciliationService.report();
        List<NetworkDiagnosticItem> reconciliationChecks = reconciliation.apps().stream()
                .filter(item -> !"healthy".equals(item.status()))
                .map(this::reconciliationCheck)
                .toList();
        List<NetworkDiagnosticItem> combinedAppChecks = new ArrayList<>(appChecks);
        combinedAppChecks.addAll(reconciliationChecks);

        String status = overallStatus(checks, combinedAppChecks);
        return new NetworkDiagnosticsReport(
                status,
                headline(status),
                summary(status, privateApps.size(), devices.size()),
                checks,
                combinedAppChecks,
                Instant.now());
    }

    private Map<String, AppAccessCheck> cachedAccessChecks(List<AppRuntimeView> apps) {
        Map<String, AppAccessCheck> checks = new LinkedHashMap<>();
        for (AppRuntimeView app : apps) {
            if (app.healthSnapshot() == null || app.healthSnapshot().localAccessStatus() == null || "not_configured".equals(app.healthSnapshot().localAccessStatus())) {
                checks.put(app.appId(), AppAccessCheck.notConfigured(app.appId()));
                continue;
            }
            String message = "reachable".equals(app.healthSnapshot().localAccessStatus()) ? "App link is responding." : "App is running, but the link is not responding.";
            checks.put(app.appId(), new AppAccessCheck(app.appId(), app.accessUrl(), app.healthSnapshot().localAccessStatus(), message, app.healthSnapshot().checkedAt()));
        }
        return checks;
    }

    private NetworkDiagnosticItem installedCheck(TailscaleStatus tailscale) {
        if (tailscale.installed()) {
            return ok("tailscale-installed", "Tailscale installed", "Private networking is available on this host.", "Autark-OS can inspect Tailscale locally.", null);
        }
        return warn("tailscale-installed", "Tailscale install needed", "Install Tailscale on this host.", "Autark-OS cannot create private app links until Tailscale is installed.", "Install Tailscale");
    }

    private NetworkDiagnosticItem connectedCheck(TailscaleStatus tailscale) {
        if (tailscale.connected()) {
            return ok("tailscale-connected", "Autark-OS connected", "This device is joined to your tailnet.", tailscale.message(), null);
        }
        return warn("tailscale-connected", "Connect Autark-OS", "Sign in to Tailscale from this device.", tailscale.message(), "Connect this device");
    }

    private NetworkDiagnosticItem dnsCheck(TailscaleStatus tailscale) {
        if (!tailscale.connected()) {
            return neutral("tailscale-dns", "Private DNS", "Waiting for Tailscale connection.", "DNS names appear after the device joins your tailnet.", null);
        }
        if (tailscale.dnsName() != null && !tailscale.dnsName().isBlank()) {
            return ok("tailscale-dns", "Private DNS ready", "Private app links can use a friendly device name.", tailscale.dnsName(), null);
        }
        return warn("tailscale-dns", "Private DNS missing", "Autark-OS will fall back to the Tailscale IP.", "Enable MagicDNS in Tailscale for friendlier private links.", "Check DNS");
    }

    private NetworkDiagnosticItem devicesCheck(TailscaleStatus tailscale, List<TailscaleDevice> devices) {
        if (!tailscale.connected()) {
            return neutral("tailnet-devices", "Devices", "Connect Autark-OS first.", "Phones and laptops will appear after setup.", null);
        }
        long online = devices.stream().filter(TailscaleDevice::online).count();
        if (online > 0) {
            return ok("tailnet-devices", "Devices online", online + " device(s) online.", devices.size() + " device(s) known on this tailnet.", null);
        }
        return warn("tailnet-devices", "No devices online", "No tailnet devices are currently online.", "Add your phone or laptop to reach apps away from home.", "Add a device");
    }

    private NetworkDiagnosticItem connectionPathCheck(List<TailscaleDevice> devices) {
        long relayCount = devices.stream()
                .filter(TailscaleDevice::online)
                .filter(device -> "relay".equals(device.connectionType()))
                .count();
        long directCount = devices.stream()
                .filter(TailscaleDevice::online)
                .filter(device -> "direct".equals(device.connectionType()))
                .count();
        if (relayCount == 0 && directCount == 0) {
            return neutral("connection-paths", "Connection paths", "Waiting for online devices.", "Direct and relay paths appear when Tailscale reports active peers.", null);
        }
        if (relayCount > 0) {
            return warn("connection-paths", "Some traffic uses relay", relayCount + " device(s) are using a relay path.", "Relay paths still work, but direct connections are usually faster.", "Review advanced details");
        }
        return ok("connection-paths", "Direct connections", directCount + " device(s) have direct paths.", "Private access should feel responsive on this network.", null);
    }

    private NetworkDiagnosticItem privateAppsCheck(TailscaleStatus tailscale, List<AppRuntimeView> apps, List<AppRuntimeView> privateApps) {
        if (privateApps.isEmpty()) {
            return warn("private-apps", "No private apps", "Choose apps to make available privately.", apps.size() + " installed app(s) can be reviewed.", "Make an app private");
        }
        if (!tailscale.connected()) {
            return warn("private-apps", "Private apps waiting", privateApps.size() + " app(s) are selected for private access.", "Connect Tailscale to activate their private links.", "Connect this device");
        }
        return ok("private-apps", "Private apps ready", privateApps.size() + " app(s) selected for private access.", "Autark-OS can show private links for these apps.", null);
    }

    private NetworkDiagnosticItem appCheck(AppRuntimeView app, AppAccessCheck accessCheck, TailscaleStatus tailscale) {
        if (!tailscale.connected()) {
            return warn(app.appId(), app.appName(), "Private link is waiting on Tailscale.", "Connect Autark-OS to activate this app's private access.", "Connect this device");
        }
        if (app.accessUrl() == null || app.accessUrl().isBlank()) {
            return warn(app.appId(), app.appName(), "This app does not have a local link yet.", "Start or repair the app so Autark-OS can build a private link.", "Repair app link");
        }
        if (app.settings() == null || app.settings().privateAccessUrl() == null || app.settings().privateAccessUrl().isBlank()) {
            return warn(app.appId(), app.appName(), "Private link has not been created yet.", "Use Repair to create a Tailscale Serve HTTPS link for this app.", "Repair private link");
        }
        if (accessCheck == null || "not_configured".equals(accessCheck.status())) {
            return warn(app.appId(), app.appName(), "Access check is not configured.", "Autark-OS needs a local URL before it can confirm private access.", "Repair app link");
        }
        if ("reachable".equals(accessCheck.status())) {
            return ok(app.appId(), app.appName(), "Private link is configured.", app.settings().privateAccessUrl(), null);
        }
        return warn(app.appId(), app.appName(), "Local access is not responding.", "The private link may exist, but the app did not answer the local health check.", "Repair app link");
    }

    private NetworkDiagnosticItem reconciliationCheck(PrivateAccessReconciliationItem item) {
        return warn("serve-" + item.appId(), item.appName(), item.message(), item.detail(), item.actionLabel());
    }

    private String overallStatus(List<NetworkDiagnosticItem> checks, List<NetworkDiagnosticItem> appChecks) {
        boolean warning = checks.stream().anyMatch(item -> "warning".equals(item.status()))
                || appChecks.stream().anyMatch(item -> "warning".equals(item.status()));
        return warning ? "warning" : "healthy";
    }

    private String headline(String status) {
        return "healthy".equals(status) ? "Private access looks ready" : "Private access needs attention";
    }

    private String summary(String status, int privateAppCount, int deviceCount) {
        if ("healthy".equals(status)) {
            return privateAppCount + " private app(s) and " + deviceCount + " tailnet device(s) are ready.";
        }
        return "Autark-OS found a few setup items before private access is fully smooth.";
    }

    private NetworkDiagnosticItem ok(String id, String label, String message, String detail, String actionLabel) {
        return new NetworkDiagnosticItem(id, label, "healthy", message, detail, actionLabel);
    }

    private NetworkDiagnosticItem warn(String id, String label, String message, String detail, String actionLabel) {
        return new NetworkDiagnosticItem(id, label, "warning", message, detail, actionLabel);
    }

    private NetworkDiagnosticItem neutral(String id, String label, String message, String detail, String actionLabel) {
        return new NetworkDiagnosticItem(id, label, "neutral", message, detail, actionLabel);
    }
}
