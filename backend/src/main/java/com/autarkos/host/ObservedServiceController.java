package com.autarkos.host;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @PostMapping("/{id}/pin")
    public HostModels.ActionResult pin(@PathVariable String id) {
        return refreshAfter(service.pin(id));
    }

    @PostMapping("/{id}/unpin")
    public HostModels.ActionResult unpin(@PathVariable String id) {
        return refreshAfter(service.unpin(id));
    }

    @PostMapping("/{id}/match")
    public HostModels.ActionResult match(@PathVariable String id, @RequestBody HostModels.ObservedServiceMatchRequest request) {
        return refreshAfter(service.updateCatalogMatch(id, request == null ? null : request.catalogAppId()));
    }

    @PostMapping("/{id}/adoption-plan")
    public HostModels.ObservedServiceAdoptionPlan adoptionPlan(@PathVariable String id) {
        return service.adoptionPlan(id);
    }

    @PostMapping("/{id}/adopt")
    public HostModels.ActionResult adopt(@PathVariable String id, @RequestBody HostModels.ObservedServiceAdoptionRequest request) {
        return refreshAfter(service.adopt(id, request));
    }

    private HostModels.ActionResult refreshAfter(HostModels.ActionResult result) {
        if (applicationStateService != null && result.ok()) {
            return result.withApplicationState(applicationStateService.refreshNow());
        }
        return result;
    }
}
