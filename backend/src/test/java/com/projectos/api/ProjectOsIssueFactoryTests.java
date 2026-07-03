package com.projectos.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProjectOsIssueFactoryTests {

    @Test
    void createsActionableIssueWithConsistentShape() {
        ProjectOsAction action = ProjectOsAction.post("repair-vaultwarden", "Repair", "/api/apps/vaultwarden/repair", false, false);

        ProjectOsIssue issue = ProjectOsIssueFactory.appIssue(
                "app-missing-vaultwarden",
                "vaultwarden",
                "critical",
                "app_missing_container",
                "Vaultwarden is missing",
                "Autark-OS cannot find the container for this app.",
                action);

        assertThat(issue.id()).isEqualTo("app-missing-vaultwarden");
        assertThat(issue.scope()).isEqualTo("app");
        assertThat(issue.subjectId()).isEqualTo("vaultwarden");
        assertThat(issue.severity()).isEqualTo("critical");
        assertThat(issue.reasonCode()).isEqualTo("app_missing_container");
        assertThat(issue.primaryAction()).contains(action);
        assertThat(issue.secondaryActions()).isEmpty();
        assertThat(issue.advancedDetails()).isEmpty();
    }

    @Test
    void createsRouteActionWithoutHttpMethod() {
        ProjectOsAction action = ProjectOsAction.route("open-discover", "Install an app", "/discover");

        assertThat(action.id()).isEqualTo("open-discover");
        assertThat(action.label()).isEqualTo("Install an app");
        assertThat(action.route()).contains("/discover");
        assertThat(action.method()).isEmpty();
        assertThat(action.href()).isEmpty();
        assertThat(action.confirmationRequired()).isFalse();
        assertThat(action.danger()).isFalse();
    }
}
