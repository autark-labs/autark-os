package com.autarkos.network.api;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.marketplace.install.PrivateAccessReconciliationService;
import com.autarkos.marketplace.install.models.AccessModels;
import com.autarkos.network.api.DeviceTrustUpdateRequest;
import com.autarkos.network.devices.DeviceAccessReport;
import com.autarkos.network.devices.DeviceTrustMetadata;
import com.autarkos.network.devices.DeviceTrustService;
import com.autarkos.network.diagnostics.NetworkDiagnosticsReport;
import com.autarkos.network.diagnostics.NetworkDiagnosticsService;
import com.autarkos.network.tailscale.TailscaleConnectGuide;
import com.autarkos.network.tailscale.TailscaleDevice;
import com.autarkos.network.tailscale.TailscaleServeResult;
import com.autarkos.network.tailscale.TailscaleService;
import com.autarkos.network.tailscale.TailscaleStatus;

@RestController
@RequestMapping("/api/network")
public class NetworkController {

    private final TailscaleService tailscaleService;
    private final NetworkDiagnosticsService diagnosticsService;
    private final PrivateAccessReconciliationService privateAccessReconciliationService;
    private final DeviceTrustService deviceTrustService;

    public NetworkController(TailscaleService tailscaleService, NetworkDiagnosticsService diagnosticsService, PrivateAccessReconciliationService privateAccessReconciliationService, DeviceTrustService deviceTrustService) {
        this.tailscaleService = tailscaleService;
        this.diagnosticsService = diagnosticsService;
        this.privateAccessReconciliationService = privateAccessReconciliationService;
        this.deviceTrustService = deviceTrustService;
    }

    @GetMapping("/tailscale/status")
    public TailscaleStatus tailscaleStatus() {
        return tailscaleService.status();
    }

    @GetMapping("/tailscale/devices")
    public List<TailscaleDevice> tailscaleDevices() {
        return tailscaleService.devices();
    }

    @GetMapping("/devices/access")
    public DeviceAccessReport deviceAccess() {
        return deviceTrustService.report();
    }

    @PutMapping("/devices/{deviceId}/metadata")
    public DeviceTrustMetadata updateDeviceMetadata(@PathVariable String deviceId, @RequestBody DeviceTrustUpdateRequest request) {
        return deviceTrustService.update(deviceId, request);
    }

    @GetMapping("/diagnostics")
    public NetworkDiagnosticsReport diagnostics() {
        return diagnosticsService.report();
    }

    @GetMapping("/private-access/reconciliation")
    public AccessModels.PrivateAccessReconciliationReport privateAccessReconciliation() {
        return privateAccessReconciliationService.report();
    }

    @DeleteMapping("/private-access/stale/{port}")
    public TailscaleServeResult removeStalePrivateAccess(@PathVariable int port) {
        return privateAccessReconciliationService.removeStaleMapping(port);
    }

    @GetMapping("/tailscale/connect-guide")
    public TailscaleConnectGuide connectGuide() {
        return tailscaleService.connectGuide();
    }
}
