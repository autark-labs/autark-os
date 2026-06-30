package com.projectos.host;

import com.projectos.apps.ApplicationState;

public record ActionResult(
        boolean ok,
        String severity,
        String title,
        String message,
        String resourceId,
        String nextAction,
        ApplicationState applicationState) {

    public ActionResult(
            boolean ok,
            String severity,
            String title,
            String message,
            String resourceId,
            String nextAction) {
        this(ok, severity, title, message, resourceId, nextAction, null);
    }

    public ActionResult withApplicationState(ApplicationState state) {
        return new ActionResult(ok, severity, title, message, resourceId, nextAction, state);
    }
}
