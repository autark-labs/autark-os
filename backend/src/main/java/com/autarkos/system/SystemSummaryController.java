package com.autarkos.system;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SystemSummaryController {

    private final SystemSummaryProvider systemSummaryProvider;

    public SystemSummaryController(SystemSummaryProvider systemSummaryProvider) {
        this.systemSummaryProvider = systemSummaryProvider;
    }

    @GetMapping("/api/system-summary")
    public SystemSummary summary() {
        return systemSummaryProvider.summary();
    }
}
