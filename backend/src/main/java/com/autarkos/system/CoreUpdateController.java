package com.autarkos.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.jobs.AutarkOsJob;

@RestController
@RequestMapping("/api/system/core-update")
public class CoreUpdateController {

    private final CoreUpdateService service;

    public CoreUpdateController(CoreUpdateService service) {
        this.service = service;
    }

    @GetMapping
    public CoreUpdateModels.Status status() {
        return service.status();
    }

    @PostMapping("/check")
    public CoreUpdateModels.Status check() {
        return service.check();
    }

    @PostMapping("/apply")
    public AutarkOsJob apply(
            @RequestBody CoreUpdateModels.ApplyRequest request) {
        return service.apply(request);
    }
}
