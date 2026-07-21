package com.autarkos.pro.entitlement;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.jobs.AutarkOsJob;
import com.autarkos.pro.module.ProModuleManager;

@RestController
@RequestMapping("/api/v1/pro")
public class ProEntitlementController {

    private final ProEntitlementService service;
    private final ProModuleManager moduleManager;

    public ProEntitlementController(
            ProEntitlementService service,
            ProModuleManager moduleManager) {
        this.service = service;
        this.moduleManager = moduleManager;
    }

    @GetMapping("/status")
    public ProStatusResponse status() {
        return service.status();
    }

    @PostMapping("/activation/start")
    public ProEntitlementService.ActivationStartResult startActivation(
            @RequestBody ActivationStartRequest request) {
        return service.startActivation(
                request == null ? null : request.activationCode());
    }

    @PostMapping("/activation/complete")
    public ProStatusResponse completeActivation(
            @RequestBody ActivationCompleteRequest request) {
        return service.completeActivation(
                request == null ? null : request.activationId());
    }

    @PostMapping("/entitlement/refresh")
    public ProStatusResponse refresh() {
        return service.refresh();
    }

    @PostMapping("/module/check")
    public AutarkOsJob checkModuleRelease() {
        return moduleManager.checkForRelease(
                service.moduleAuthorization());
    }

    @PostMapping("/module/install")
    public AutarkOsJob installOrUpdateModule() {
        return moduleManager.installOrUpdate(
                service.moduleAuthorization());
    }

    @PostMapping("/module/remove")
    public AutarkOsJob removeModule() {
        return moduleManager.remove();
    }

    @PostMapping("/deactivate")
    public ProEntitlementService.DeactivationResult deactivate(
            @RequestBody DeactivationRequest request) {
        return service.deactivate(
                request == null ? null : request.confirmation(),
                request != null && request.acknowledgeModuleDataRetained(),
                request != null
                        && request.acknowledgeAccountAssociationRetained());
    }

    public record ActivationStartRequest(String activationCode) {
    }

    public record ActivationCompleteRequest(UUID activationId) {
    }

    public record DeactivationRequest(
            String confirmation,
            boolean acknowledgeModuleDataRetained,
            boolean acknowledgeAccountAssociationRetained) {
    }
}
