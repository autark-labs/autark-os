package com.autarkos.apps;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/application-state")
public class ApplicationStateController {

    private final ApplicationStateService service;

    public ApplicationStateController(ApplicationStateService service) {
        this.service = service;
    }

    @GetMapping
    public ApplicationState state(@RequestParam(defaultValue = "false") boolean refresh) {
        return refresh ? service.refreshNow() : service.snapshot();
    }

    @PostMapping("/refresh")
    public ApplicationState refresh() {
        return service.refreshNow();
    }
}
