package com.projectos.automation;

import org.springframework.stereotype.Service;

import com.projectos.system.ProjectSettingsService;

@Service
public class AutomationService {

    public static final String RESTART_UNHEALTHY_APP = "restart-unhealthy-app";

    private final ProjectSettingsService settingsService;

    public AutomationService(ProjectSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public boolean recipeEnabled(String recipeId) {
        if (RESTART_UNHEALTHY_APP.equals(recipeId)) {
            return settingsService.current().automaticRepairEnabled();
        }
        return false;
    }
}
