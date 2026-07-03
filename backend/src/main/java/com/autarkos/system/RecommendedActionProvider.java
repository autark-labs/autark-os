package com.autarkos.system;

public interface RecommendedActionProvider {
    RecommendedAction current();

    void dismiss(String actionId);
}
