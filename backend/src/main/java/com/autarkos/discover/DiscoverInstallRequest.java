package com.autarkos.discover;

import java.util.Map;

public record DiscoverInstallRequest(
        Map<String, Object> answers,
        Boolean reinstall,
        Boolean duplicateAcknowledged) {

    public DiscoverInstallRequest(Map<String, Object> answers, Boolean reinstall) {
        this(answers, reinstall, false);
    }

    public DiscoverSetupAnswersRequest answersRequest() {
        return new DiscoverSetupAnswersRequest(answers);
    }

    public boolean reinstallRequested() {
        return Boolean.TRUE.equals(reinstall);
    }

    public boolean duplicateAcknowledgedRequested() {
        return Boolean.TRUE.equals(duplicateAcknowledged);
    }
}
