package com.autarkos.system;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public class InMemoryRecommendedActionDismissals implements RecommendedActionDismissals {

    private final Set<String> dismissed = ConcurrentHashMap.newKeySet();

    @Override
    public boolean dismissed(String actionId) {
        return dismissed.contains(actionId);
    }

    @Override
    public void dismiss(String actionId) {
        if (actionId != null && !actionId.isBlank()) {
            dismissed.add(actionId);
        }
    }
}
