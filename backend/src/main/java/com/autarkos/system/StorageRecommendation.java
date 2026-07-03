package com.autarkos.system;

public record StorageRecommendation(
        String id,
        String tone,
        String title,
        String message,
        String actionLabel) {
}
