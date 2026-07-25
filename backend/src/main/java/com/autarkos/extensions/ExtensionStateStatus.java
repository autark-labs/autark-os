package com.autarkos.extensions;

public record ExtensionStateStatus(
        int schemaVersion,
        String compatibility) {
}
