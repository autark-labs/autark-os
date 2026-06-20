package com.projectos.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/overview",
            "/applications",
            "/marketplace",
            "/devices",
            "/network",
            "/storage",
            "/backups",
            "/monitoring",
            "/automation",
            "/settings",
            "/terminal"
    })
    public String index() {
        return "forward:/index.html";
    }
}
