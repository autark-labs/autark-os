package com.projectos.host;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/host/inventory")
public class HostInventoryController {

    private final HostInventoryService service;

    public HostInventoryController(HostInventoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<HostInventoryResource> inventory(@RequestParam(defaultValue = "false") boolean includeIgnored) {
        return service.inventory(includeIgnored);
    }

    @PostMapping("/{resourceId}/ignore")
    public ActionResult ignore(@PathVariable String resourceId) {
        return service.ignore(resourceId);
    }

    @DeleteMapping("/{resourceId}/ignore")
    public ActionResult unignore(@PathVariable String resourceId) {
        return service.unignore(resourceId);
    }
}
