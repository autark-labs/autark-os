package com.autarkos.testsupport;

import java.util.List;

import com.autarkos.apps.ApplicationAction;
import com.autarkos.apps.ApplicationRelationship;
import com.autarkos.apps.ApplicationView;
import com.autarkos.marketplace.install.AppInstanceView;
import com.autarkos.marketplace.install.AppRuntimeView;

public final class ApplicationViewTestRecords {

    private ApplicationViewTestRecords() {
    }

    public static ApplicationView managed(AppRuntimeView runtime) {
        return new ApplicationView(
                runtime.appId(), runtime.appName(), runtime.category(), runtime.image(), runtime.description(), runtime.description(),
                ApplicationRelationship.MANAGED, "installable", runtime.appId(), runtime.technicalStatus(), "owned",
                runtime.accessRoute() != null && runtime.accessRoute().privateUrl() != null ? "private_ready" : "local_ready",
                runtime.canonicalBackupState() == null ? "backup_disabled" : runtime.canonicalBackupState(), List.of(),
                "Installed", "Managed by this Autark-OS instance.", "success", "success", false, null,
                new ApplicationAction("manage", "Manage", "route", "/apps", null, false, ""), List.of(), runtime, null);
    }

    public static ApplicationView managed(AppInstanceView app) {
        AppRuntimeView runtime = new AppRuntimeView(
                app.catalogAppId(), app.name(), app.category(), "", "", app.icon(), app.userStatus(), app.runtimeState(), "",
                "/runtime/apps/" + app.catalogAppId(), "autark-os-" + app.catalogAppId(), app.localUrl(), null, null, null,
                app.updatedAt(), "", app.backupState(), null, null, null, null, null, List.of(), null, List.of());
        return new ApplicationView(
                app.catalogAppId(), app.name(), app.category(), app.icon(), "", "", ApplicationRelationship.MANAGED,
                "installable", app.appInstanceId(), app.runtimeState(), app.ownershipState(), app.accessState(), app.backupState(),
                app.issues(), "Installed", "Managed by this Autark-OS instance.", "success", "success", false, null,
                new ApplicationAction("manage", "Manage", "route", "/apps", null, false, ""), List.of(), runtime, null);
    }
}
