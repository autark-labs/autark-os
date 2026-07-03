package com.autarkos.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/home",
            "/setup",
            "/apps",
            "/apps/found",
            "/discover",
            "/access",
            "/storage",
            "/backups",
            "/activity",
            "/settings",
            "/diagnostics",
            "/overview",
            "/applications",
            "/marketplace",
            "/network",
            "/monitoring",
            "/terminal",
            "/safe-diagnostics",
            "/files-storage",
            "/system-activity",
            "/resolve-existing-apps"
    })
    public String index() {
        return "forward:/index.html";
    }
}
