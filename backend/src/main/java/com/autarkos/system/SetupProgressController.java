package com.autarkos.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/setup")
public class SetupProgressController {

    private final SetupProgressService service;
    private final SetupStatusService statusService;

    public SetupProgressController(SetupProgressService service, SetupStatusService statusService) {
        this.service = service;
        this.statusService = statusService;
    }

    @GetMapping("/progress")
    public SetupProgressModels.SetupProgress progress() {
        return service.status();
    }

    @GetMapping("/status")
    public SetupProgressModels.SetupStatus status() {
        return statusService.status();
    }

    @PostMapping("/progress/complete")
    public SetupProgressModels.SetupProgress complete(@RequestBody SetupProgressModels.SetupProgressUpdateRequest request) {
        return service.completeStep(request.step());
    }

    @PostMapping("/progress/skip")
    public SetupProgressModels.SetupProgress skip(@RequestBody SetupProgressModels.SetupProgressUpdateRequest request) {
        return service.skipStep(request.step());
    }
}
