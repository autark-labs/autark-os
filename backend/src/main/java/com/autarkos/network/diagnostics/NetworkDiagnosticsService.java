package com.autarkos.network.diagnostics;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.autarkos.apps.ApplicationStateService;
import com.autarkos.marketplace.install.AppRuntimeView;
import com.autarkos.marketplace.install.PrivateAccessReconciliationService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.network.tailscale.TailscaleDevice;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class NetworkDiagnosticsService {

    private final TailscaleService tailscaleService;
    private final ApplicationStateService applicationStateService;
    private final PrivateAccessReconciliationService reconciliationService;

    public NetworkDiagnosticsService(TailscaleService tailscaleService, ApplicationStateService applicationStateService, PrivateAccessReconciliationService reconciliationService) {
        this.tailscaleService = tailscaleService;
        this.applicationStateService = applicationStateService;
        this.reconciliationService = reconciliationService;
    }

    public NetworkDiagnosticsReport report() {
        TailscaleStatus tailscale = tailscaleService.status();
        List<TailscaleDevice> devices = tailscaleService.devices();
        List<AppRuntimeView> apps = applicationStateService.snapshot().runtimeApps();
        AccessModels.PrivateAccessReconciliationReport reconciliation = reconciliationService.report();
        int privateAppCount = reconciliation.apps().size();

        List<NetworkDiagnosticItem> checks = new ArrayList<>();
        checks.add(installedCheck(tailscale));
        checks.add(connectedCheck(tailscale));
        checks.add(dnsCheck(tailscale));
        checks.add(devicesCheck(tailscale, devices));
        checks.add(connectionPathCheck(devices));
        checks.add(privateAppsCheck(tailscale, apps, privateAppCount, reconciliation));

        List<NetworkDiagnosticItem> appChecks = reconciliation.apps().stream()
                .map(this::reconciliationCheck)
                .toList();

        String status = overallStatus(checks, appChecks);
        return new NetworkDiagnosticsReport(
                status,
                headline(status),
                summary(status, privateAppCount, devices.size()),
                checks,
                appChecks,
                Instant.now());
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

    private NetworkDiagnosticItem privateAppsCheck(TailscaleStatus tailscale, List<AppRuntimeView> apps, int privateAppCount, AccessModels.PrivateAccessReconciliationReport reconciliation) {
        if (privateAppCount == 0) {
            return warn("private-apps", "No private apps", "Choose apps to make available privately.", apps.size() + " installed app(s) can be reviewed.", "Make an app private");
        }
        if (!tailscale.connected()) {
            return warn("private-apps", "Private apps waiting", privateAppCount + " app(s) are selected for private access.", "Connect Tailscale to activate their private links.", "Connect this device");
        }
        long verified = reconciliation.apps().stream().filter(item -> "healthy".equals(item.status())).count();
        if (verified == privateAppCount) {
            return ok("private-apps", "Private apps verified", verified + " app(s) have live Tailscale Serve mappings.", "Autark-OS verified every selected private app link.", null);
        }
        return warn("private-apps", "Some private apps need setup", verified + " of " + privateAppCount + " selected app link(s) are verified.", "Review the app checks below before using their private links.", "Review private links");
    }

    private NetworkDiagnosticItem reconciliationCheck(AccessModels.PrivateAccessReconciliationItem item) {
        if ("healthy".equals(item.status())) {
            return ok("serve-" + item.appId(), item.appName(), item.message(), item.expectedPrivateUrl(), null);
        }
        if ("waiting".equals(item.status())) {
            return neutral("serve-" + item.appId(), item.appName(), item.message(), item.detail(), item.actionLabel());
        }
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
