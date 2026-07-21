package com.autarkos.pro.runtime;

import java.util.Locale;

final class ProRuntimeArchitecture {

    private ProRuntimeArchitecture() {
    }

    static String resolve(String configured) {
        if (configured != null && !configured.isBlank()) {
            if (java.util.List.of(
                            "linux/amd64",
                            "linux/arm64")
                    .contains(configured)) {
                return configured;
            }
            throw new IllegalStateException(
                    "Autark Pro does not support this architecture.");
        }
        return switch (System.getProperty("os.arch", "")
                .toLowerCase(Locale.ROOT)) {
            case "amd64", "x86_64" -> "linux/amd64";
            case "arm64", "aarch64" -> "linux/arm64";
            default -> throw new IllegalStateException(
                    "Autark Pro does not support this architecture.");
        };
    }
}
