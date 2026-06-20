package com.projectos.system;

public record OrphanedStorage(
        String name,
        String path,
        long usedBytes) {
}
