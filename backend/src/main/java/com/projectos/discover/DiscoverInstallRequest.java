package com.projectos.discover;

import java.util.Map;

public record DiscoverInstallRequest(
        Map<String, Object> answers,
        Boolean reinstall) {

    public DiscoverSetupAnswersRequest answersRequest() {
        return new DiscoverSetupAnswersRequest(answers);
    }

    public boolean reinstallRequested() {
        return Boolean.TRUE.equals(reinstall);
    }
}
