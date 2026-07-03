package com.autarkos.system;

public record OrphanedStorage(
        String name,
        String path,
        long usedBytes) {
}
