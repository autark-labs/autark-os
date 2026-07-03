package com.autarkos.marketplace.install;

public record AppRemediationView(
        String state,
        String label,
        String summary,
        String nextActionLabel,
        String tone) {
}
