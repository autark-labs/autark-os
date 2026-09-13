package com.autarkos.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.system.UpdateInventoryModels.Snapshot;
import com.autarkos.system.UpdateInventoryModels.Verification;

@RestController
@RequestMapping("/api/system/update-inventory")
public class UpdateInventoryController {

    private final UpdateInventoryService service;

    public UpdateInventoryController(UpdateInventoryService service) {
        this.service = service;
    }

    @GetMapping
    public Snapshot capture() {
        return service.capture();
    }

    @PostMapping("/verify")
    public Verification verify(@RequestBody Snapshot before) {
        return service.verify(before);
    }
}
