package com.autarkos.extensions;

import java.time.Instant;

public interface ExtensionRefreshStatusSource {

    Status status();

    record Status(
            String state,
            Instant latestAnalysisAt,
            Instant nextAnalysisAt,
            int activeFindingCount,
            String highestSeverity,
            String reasonCode) {

        public static Status unavailable() {
            return new Status(
                    "unavailable",
                    null,
                    null,
                    0,
                    "none",
                    "not_implemented");
        }
    }
}
