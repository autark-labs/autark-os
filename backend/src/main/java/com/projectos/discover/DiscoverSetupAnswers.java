package com.projectos.discover;

import java.util.Map;

public record DiscoverSetupAnswers(Map<String, Object> values) {

    public Object value(String id) {
        return values == null ? null : values.get(id);
    }

    public String stringValue(String id) {
        Object value = value(id);
        return value == null ? "" : String.valueOf(value).trim();
    }
}
