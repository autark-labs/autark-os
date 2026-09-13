package com.autarkos.apps.recovery;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.host.HostModels;

@RestController
@RequestMapping("/api/app-recovery")
public class AppRecoveryController {

    private final AppRecoveryService service;

    public AppRecoveryController(AppRecoveryService service) {
        this.service = service;
    }

    @GetMapping
    public List<AppRecoveryModels.RecoveryCandidate> list() {
        return service.list();
    }

    @GetMapping("/{appId}/plan")
    public AppRecoveryModels.RecoveryPlan plan(@PathVariable String appId) {
        return service.plan(appId);
    }

    @PostMapping("/{appId}/apply")
    public HostModels.ActionResult apply(
            @PathVariable String appId,
            @RequestBody AppRecoveryModels.RecoveryApplyRequest request) {
        return service.apply(appId, request);
    }
}
