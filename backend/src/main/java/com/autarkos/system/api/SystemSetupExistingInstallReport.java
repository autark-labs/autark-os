package com.autarkos.system.api;

import java.util.List;

public record SystemSetupExistingInstallReport(
        boolean conflict,
        boolean developmentInstanceAllowed,
        String severity,
        String headline,
        String summary,
        List<SystemSetupExistingInstallResource> resources,
        List<SystemSetupAction> actions) {
}
