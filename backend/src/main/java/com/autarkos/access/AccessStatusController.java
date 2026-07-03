package com.autarkos.access;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/access")
public class AccessStatusController {

    private final AccessStatusService service;

    public AccessStatusController(AccessStatusService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public AccessStatus status() {
        return service.status();
    }
}
