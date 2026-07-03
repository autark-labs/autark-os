package com.autarkos.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class AutarkOsIssueFactory {

    private AutarkOsIssueFactory() {
    }

    public static AutarkOsIssue systemIssue(String id, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "system", "", severity, reasonCode, title, summary, primaryAction);
    }

    public static AutarkOsIssue appIssue(String id, String appId, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "app", appId, severity, reasonCode, title, summary, primaryAction);
    }

    public static AutarkOsIssue backupIssue(String id, String subjectId, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "backup", subjectId, severity, reasonCode, title, summary, primaryAction);
    }

    public static AutarkOsIssue accessIssue(String id, String subjectId, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "access", subjectId, severity, reasonCode, title, summary, primaryAction);
    }

    public static AutarkOsIssue setupIssue(String id, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "setup", "", severity, reasonCode, title, summary, primaryAction);
    }

    public static AutarkOsIssue storageIssue(String id, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return issue(id, "storage", "", severity, reasonCode, title, summary, primaryAction);
    }

    private static AutarkOsIssue issue(String id, String scope, String subjectId, String severity, String reasonCode, String title, String summary, AutarkOsAction primaryAction) {
        return new AutarkOsIssue(
                id,
                scope,
                subjectId == null ? "" : subjectId,
                severity,
                reasonCode,
                title,
                summary,
                Optional.ofNullable(primaryAction),
                List.of(),
                Map.of());
    }
}
