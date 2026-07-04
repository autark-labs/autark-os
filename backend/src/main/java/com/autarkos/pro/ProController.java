package com.autarkos.pro;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.autarkos.pro.models.ProModels;

@RestController
@RequestMapping("/api/pro")
public class ProController {

    private final ProService proService;

    public ProController(ProService proService) {
        this.proService = proService;
    }

    @GetMapping("/status")
    public ProModels.ProStatus status() {
        return proService.status();
    }
}
