package com.autarkos.access;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.autarkos.api.AutarkOsAction;
import com.autarkos.api.AutarkOsIssue;
import com.autarkos.api.AutarkOsIssueFactory;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppInstanceViewProvider;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class AccessStatusService {

    private final Supplier<List<AppInstanceView>> appViews;
    private final Supplier<TailscaleStatus> tailscaleStatus;
    private final Supplier<String> serverLanUrl;
    private final Supplier<Instant> clock;

    @Autowired
    public AccessStatusService(AppInstanceViewProvider appInstanceViewProvider, TailscaleService tailscaleService) {
        this(appInstanceViewProvider::list, tailscaleService::status, () -> "http://localhost:8082", Instant::now);
    }

    public AccessStatusService(
            Supplier<List<AppInstanceView>> appViews,
            Supplier<TailscaleStatus> tailscaleStatus,
            Supplier<String> serverLanUrl,
            Supplier<Instant> clock) {
        this.appViews = appViews;
        this.tailscaleStatus = tailscaleStatus;
        this.serverLanUrl = serverLanUrl;
        this.clock = clock;
    }

    public AccessStatus status() {
        List<AppInstanceView> apps = appViews.get();
        TailscaleStatus status = tailscaleStatus.get();
        AccessTailscaleStatus tailscale = tailscale(status, apps);
        List<AccessAppStatus> appStatuses = apps.stream()
                .map(this::appStatus)
                .toList();
        List<AutarkOsIssue> issues = issues(status, tailscale, apps);
        List<AutarkOsAction> actions = actions(status, tailscale, apps);
        return new AccessStatus(mode(tailscale, apps), serverLanUrl.get(), tailscale, appStatuses, issues, actions, clock.get());
    }

    private AccessTailscaleStatus tailscale(TailscaleStatus status, List<AppInstanceView> apps) {
        boolean mock = "dev".equalsIgnoreCase(status.state());
        boolean magicDnsReady = status.connected() && hasText(status.dnsName());
        boolean privateAppReady = apps.stream().anyMatch(app -> "private_ready".equals(app.accessState()));
        return new AccessTailscaleStatus(
                status.installed(),
                status.connected(),
                clean(status.dnsName(), status.deviceName()),
                magicDnsReady,
                magicDnsReady,
                mock || privateAppReady,
                mock ? "mock" : status.installed() ? "real" : "unavailable");
    }

    private AccessAppStatus appStatus(AppInstanceView app) {
        return new AccessAppStatus(
                app.appInstanceId(),
                app.name(),
                clean(app.localUrl()),
                clean(app.privateUrl()),
                List.of("local_ready", "private_ready", "private_waiting", "private_needs_setup").contains(app.accessState()),
                null);
    }

    private String mode(AccessTailscaleStatus tailscale, List<AppInstanceView> apps) {
        if ("mock".equals(tailscale.mode())) {
            return "mocked_dev";
        }
        boolean privateReady = apps.stream().anyMatch(app -> "private_ready".equals(app.accessState()));
        if (privateReady && tailscale.signedIn() && tailscale.magicDnsReady()) {
            return "private_ready";
        }
        if (privateAccessRequested(apps)) {
            return "private_needs_setup";
        }
        return "local_only";
    }

    private List<AutarkOsIssue> issues(TailscaleStatus status, AccessTailscaleStatus tailscale, List<AppInstanceView> apps) {
        List<AutarkOsIssue> issues = new ArrayList<>();
        if ("mock".equals(tailscale.mode())) {
            issues.add(AutarkOsIssueFactory.accessIssue(
                    "tailscale-mock-dev",
                    "tailscale",
                    "info",
                    "tailscale_mock_dev",
                    "Private access is mocked in development",
                    "Autark-OS is using a development Tailscale mock. This confirms UI behavior, not production private access.",
                    AutarkOsAction.route("open-diagnostics", "View diagnostics", "/diagnostics")));
            appendAppAccessIssues(issues, apps);
            return issues;
        }
        if (!privateAccessRequested(apps)) {
            appendAppAccessIssues(issues, apps);
            return issues;
        }
        if (!status.installed()) {
            issues.add(AutarkOsIssueFactory.accessIssue(
                    "tailscale-not-installed",
                    "tailscale",
                    "warning",
                    "tailscale_not_installed",
                    "Tailscale is not installed",
                    "Private links need Tailscale installed and signed in on the Autark-OS host.",
                    AutarkOsAction.route("open-tailscale-setup", "Set up Tailscale", "/access")));
        } else if (!status.connected()) {
            issues.add(AutarkOsIssueFactory.accessIssue(
                    "tailscale-not-signed-in",
                    "tailscale",
                    "warning",
                    "tailscale_not_signed_in",
                    "Sign in to Tailscale",
                    "Private links are configured, but this host is not signed in to Tailscale yet.",
                    AutarkOsAction.route("open-tailscale-setup", "Set up Tailscale", "/access")));
        } else if (!tailscale.magicDnsReady()) {
            issues.add(AutarkOsIssueFactory.accessIssue(
                    "tailscale-magicdns-not-ready",
                    "tailscale",
                    "warning",
                    "tailscale_magicdns_not_ready",
                    "Tailscale DNS is not ready",
                    "Private links need this host to have a Tailscale DNS name.",
                    AutarkOsAction.route("open-tailscale-setup", "Set up Tailscale", "/access")));
        }
        appendAppAccessIssues(issues, apps);
        return issues;
    }

    private List<AutarkOsAction> actions(TailscaleStatus status, AccessTailscaleStatus tailscale, List<AppInstanceView> apps) {
        List<AutarkOsAction> actions = new ArrayList<>();
        if ("mock".equals(tailscale.mode())) {
            actions.add(AutarkOsAction.route("open-diagnostics", "View diagnostics", "/diagnostics"));
        } else if (privateAccessRequested(apps) && (!status.installed() || !status.connected() || !tailscale.magicDnsReady())) {
            actions.add(AutarkOsAction.route("open-tailscale-setup", "Set up Tailscale", "/access"));
        }
        apps.stream()
                .filter(app -> hasText(app.localUrl()) || hasText(app.privateUrl()))
                .limit(3)
                .map(app -> AutarkOsAction.get(
                        "open-" + app.appInstanceId(),
                        "Open " + app.name(),
                        "private_ready".equals(app.accessState()) && hasText(app.privateUrl()) ? app.privateUrl() : app.localUrl()))
                .forEach(actions::add);
        return actions;
    }

    private boolean privateAccessRequested(List<AppInstanceView> apps) {
        return apps.stream().anyMatch(app -> hasText(app.privateUrl()) || app.accessState().startsWith("private_"));
    }

    private void appendAppAccessIssues(List<AutarkOsIssue> issues, List<AppInstanceView> apps) {
        apps.stream()
                .flatMap(app -> app.issues().stream())
                .filter(issue -> "access".equals(issue.scope()))
                .forEach(issues::add);
    }

    private String clean(String primary, String fallback) {
        return hasText(primary) ? primary : clean(fallback);
    }

    private String clean(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
