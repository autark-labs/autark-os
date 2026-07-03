package com.autarkos.system;

import java.time.Instant;

public record StorageTrendPoint(
        long usedBytes,
        Instant sampledAt) {
}
