package com.autarkos.host;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;

import com.autarkos.apps.ApplicationStateService;

@RestController
@RequestMapping("/api/observed-services")
public class ObservedServiceController {

    private final ObservedServiceService service;
    private final ApplicationStateService applicationStateService;

    public ObservedServiceController(ObservedServiceService service) {
        this(service, null);
    }

    @Autowired
    public ObservedServiceController(ObservedServiceService service, ApplicationStateService applicationStateService) {
        this.service = service;
        this.applicationStateService = applicationStateService;
    }

    @GetMapping
    public List<ObservedServiceView> list() {
        return service.list(true);
    }

    @PostMapping("/refresh")
    public List<ObservedServiceView> refresh() {
        List<ObservedServiceView> services = service.refresh();
        if (applicationStateService != null) {
            applicationStateService.refreshInBackground();
        }
        return services;
    }

    @GetMapping("/{id}")
    public ObservedServiceView get(@PathVariable String id) {
        return service.get(id);
    }

}
