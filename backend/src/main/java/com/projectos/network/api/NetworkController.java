package com.projectos.network.api;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;

import com.projectos.network.tailscale.TailscaleConnectGuide;
import com.projectos.network.tailscale.TailscaleDevice;
import com.projectos.network.tailscale.TailscaleServeResult;
import com.projectos.network.tailscale.TailscaleService;
import com.projectos.network.tailscale.TailscaleStatus;
import com.projectos.network.devices.DeviceAccessReport;
import com.projectos.network.devices.DeviceTrustMetadata;
import com.projectos.network.devices.DeviceTrustService;
import com.projectos.network.api.DeviceTrustUpdateRequest;
import com.projectos.marketplace.install.PrivateAccessReconciliationReport;
import com.projectos.marketplace.install.PrivateAccessReconciliationService;
import com.projectos.network.diagnostics.NetworkDiagnosticsReport;
import com.projectos.network.diagnostics.NetworkDiagnosticsService;

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
    public PrivateAccessReconciliationReport privateAccessReconciliation() {
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
