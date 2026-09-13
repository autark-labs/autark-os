package com.autarkos.apps;

import java.util.List;

import com.autarkos.marketplace.install.AppRuntimeView;

public final class ApplicationViews {

    private ApplicationViews() {
    }

    public static List<ApplicationView> managed(ApplicationState state) {
        if (state == null || state.applications() == null) {
            return List.of();
        }
        return state.applications().stream()
                .filter(ApplicationView::managed)
                .toList();
    }

    public static List<AppRuntimeView> managedRuntimes(ApplicationState state) {
        return managed(state).stream()
                .map(ApplicationView::runtime)
                .filter(java.util.Objects::nonNull)
                .toList();
    }
}
