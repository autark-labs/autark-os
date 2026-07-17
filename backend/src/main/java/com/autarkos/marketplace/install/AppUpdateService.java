package com.autarkos.marketplace.install;

import org.springframework.stereotype.Service;

import com.autarkos.marketplace.install.models.UpdateModels;

/**
 * Declares the current product boundary for managed application updates.
 *
 * App updates remain disabled until Autark-OS can preserve each app's saved
 * settings and secrets through a durable, reversible update job. Keeping this
 * decision in one service gives old API callers an intentional answer without
 * allowing a partial mutation path to reach Docker or Compose.
 */
@Service
public class AppUpdateService {

    public UpdateModels.AppUpdateCapability capability() {
        return UpdateModels.AppUpdateCapability.unavailable();
    }
}
