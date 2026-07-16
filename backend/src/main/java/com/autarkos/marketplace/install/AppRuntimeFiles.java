package com.autarkos.marketplace.install;

import java.nio.file.Files;
import java.nio.file.Path;

/** Shared filesystem checks for actions that require a recoverable app runtime. */
public final class AppRuntimeFiles {

    private AppRuntimeFiles() {
    }

    public static boolean hasComposeFile(String runtimePath) {
        if (runtimePath == null || runtimePath.isBlank()) {
            return false;
        }
        try {
            return isComposeFile(Path.of(runtimePath).resolve("compose.yaml"));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    public static boolean isComposeFile(Path composeFile) {
        if (composeFile == null) {
            return false;
        }
        try {
            return Files.isRegularFile(composeFile);
        } catch (RuntimeException exception) {
            return false;
        }
    }
}
