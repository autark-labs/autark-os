package com.projectos.discover;

import java.util.Map;

public record DiscoverSetupAnswersRequest(Map<String, Object> answers) {

    public DiscoverSetupAnswers setupAnswers() {
        return new DiscoverSetupAnswers(answers == null ? Map.of() : answers);
    }
}
