package com.autarkos.testsupport;

import java.util.List;

import com.autarkos.api.AppOperationView;
import com.autarkos.apps.ApplicationAction;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationView;
import com.autarkos.marketplace.install.AppRuntimeView;

public final class ApplicationViewTestRecords {

    private ApplicationViewTestRecords() {
    }

    public static ApplicationView managed(AppRuntimeView runtime) {
        return new ApplicationView(
                runtime.appId(), runtime.appName(), runtime.category(), runtime.image(), runtime.description(), runtime.description(),
                ApplicationRelationship.MANAGED, "installable", runtime.appId(), AppOperationView.idle(), List.of(),
                "Installed", "Managed by this Autark-OS instance.", "success", "success",
                new ApplicationAction("manage", "Manage", "route", "/apps", null, false, ""), List.of(), runtime, null);
    }
}
