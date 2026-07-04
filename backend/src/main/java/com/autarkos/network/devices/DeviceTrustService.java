package com.autarkos.network.devices;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.marketplace.install.AccessModels;
import com.autarkos.marketplace.install.PrivateAccessReconciliationService;
import com.autarkos.network.api.DeviceTrustUpdateRequest;
import com.autarkos.network.tailscale.TailscaleDevice;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@Service
public class DeviceTrustService {

    private final TailscaleService tailscaleService;
    private final PrivateAccessReconciliationService privateAccessReconciliationService;
    private final DeviceTrustRepository repository;
    private final ActivityLogService activityLogService;

    public DeviceTrustService(TailscaleService tailscaleService, PrivateAccessReconciliationService privateAccessReconciliationService, DeviceTrustRepository repository, ActivityLogService activityLogService) {
        this.tailscaleService = tailscaleService;
        this.privateAccessReconciliationService = privateAccessReconciliationService;
        this.repository = repository;
        this.activityLogService = activityLogService;
    }

    public DeviceAccessReport report() {
        Instant checkedAt = Instant.now();
        TailscaleStatus status = tailscaleService.status();
        List<TailscaleDevice> devices = tailscaleService.devices();
        AccessModels.PrivateAccessReconciliationReport reconciliation = privateAccessReconciliationService.report();
        Map<String, DeviceTrustMetadata> metadataById = repository.metadataByDeviceId();
        int expectedPrivateApps = reconciliation.apps().size();
        int healthyPrivateApps = (int) reconciliation.apps().stream()
                .filter(DeviceTrustService::healthy)
                .count();

        List<TrustedDeviceView> views = devices.stream()
                .map(device -> view(device, metadataById.get(device.id()), status, healthyPrivateApps, expectedPrivateApps, checkedAt))
                .toList();
        long onlineDevices = devices.stream().filter(TailscaleDevice::online).count();
        long trustedDevices = views.stream().filter(view -> view.metadata().trusted()).count();
        long verifiedDevices = views.stream().filter(view -> view.reachability().verifiedFromAutarkOs()).count();

        String reportStatus = status.connected() ? "ready" : "needs_setup";
        String headline = status.connected() ? "Tailnet devices are visible" : "Connect Tailscale to see device access";
        String summary = status.connected()
                ? onlineDevices + " online, " + trustedDevices + " trusted, " + verifiedDevices + " checked against Autark-OS private links."
                : "Autark-OS needs Tailscale before it can show which devices should access private apps.";

        return new DeviceAccessReport(reportStatus, headline, summary, status, reconciliation, views, onboardingSteps(), checkedAt);
    }

    public DeviceTrustMetadata update(String deviceId, DeviceTrustUpdateRequest request) {
        DeviceTrustMetadata metadata = repository.upsert(deviceId, request);
        activityLogService.success(
                "network",
                "device_metadata_updated",
                "Device access label updated",
                "Saved friendly device access settings for " + metadata.deviceId() + ".",
                null);
        return metadata;
    }

    private TrustedDeviceView view(TailscaleDevice device, DeviceTrustMetadata storedMetadata, TailscaleStatus status, int healthyPrivateApps, int expectedPrivateApps, Instant checkedAt) {
        DeviceTrustMetadata metadata = storedMetadata == null ? defaultMetadata(device, checkedAt) : storedMetadata;
        return new TrustedDeviceView(device, metadata, reachability(device, metadata, status, healthyPrivateApps, expectedPrivateApps, checkedAt));
    }

    private DeviceTrustMetadata defaultMetadata(TailscaleDevice device, Instant checkedAt) {
        String group = device.self() ? "Autark-OS host" : "Tailnet devices";
        return new DeviceTrustMetadata(device.id(), "", group, true, "", checkedAt);
    }

    private DeviceReachability reachability(TailscaleDevice device, DeviceTrustMetadata metadata, TailscaleStatus status, int healthyPrivateApps, int expectedPrivateApps, Instant checkedAt) {
        if (!status.connected()) {
            return new DeviceReachability("needs_setup", "Needs Tailscale", "Connect Autark-OS to Tailscale before checking private access.", device.online(), metadata.trusted(), false, 0, expectedPrivateApps, checkedAt);
        }
        if (!device.online()) {
            return new DeviceReachability("offline", "Offline", "This device cannot reach private apps until it reconnects to the tailnet.", false, metadata.trusted(), false, 0, expectedPrivateApps, checkedAt);
        }
        if (!metadata.trusted()) {
            return new DeviceReachability("not_expected", "Not expected", "This device is online but is not expected to use Autark-OS private app links.", true, false, false, 0, expectedPrivateApps, checkedAt);
        }
        if (expectedPrivateApps == 0) {
            return new DeviceReachability("no_private_apps", "Ready", "This device is trusted. No private apps are configured yet.", true, true, false, 0, 0, checkedAt);
        }
        if (healthyPrivateApps == expectedPrivateApps) {
            return new DeviceReachability("verified_from_autark_os", "Verified", "Autark-OS verified its private links. This device should reach them when Tailscale policy allows it.", true, true, true, healthyPrivateApps, expectedPrivateApps, checkedAt);
        }
        if (healthyPrivateApps > 0) {
            return new DeviceReachability("partial", "Partial", healthyPrivateApps + " of " + expectedPrivateApps + " private links look ready from Autark-OS.", true, true, false, healthyPrivateApps, expectedPrivateApps, checkedAt);
        }
        return new DeviceReachability("needs_attention", "Check links", "Autark-OS cannot verify any private app links from this host yet.", true, true, false, 0, expectedPrivateApps, checkedAt);
    }

    private static boolean healthy(AccessModels.PrivateAccessReconciliationItem item) {
        return "healthy".equalsIgnoreCase(item.status());
    }

    private List<String> onboardingSteps() {
        return List.of(
                "Install Tailscale on the phone, laptop, or tablet you want to use.",
                "Sign in with the same Tailscale account or join the same tailnet.",
                "Open an Autark-OS private app link from that device.",
                "Return here to give the device a friendly name and choose whether it should use private apps.");
    }
}
