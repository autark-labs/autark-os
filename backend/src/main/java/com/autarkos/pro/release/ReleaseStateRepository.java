package com.autarkos.pro.release;

import java.time.Instant;
import java.util.OptionalLong;

public interface ReleaseStateRepository {

    AcceptanceResult accept(AcceptedRelease release);

    void markKnownGood(
            String component,
            String releaseChannel,
            String digest,
            String manifestFingerprint,
            Instant knownGoodAt);

    boolean isKnownGood(
            String component,
            String releaseChannel,
            String digest,
            String manifestFingerprint);

    OptionalLong highestAcceptedSequence(String component, String releaseChannel);

    enum AcceptanceResult {
        ACCEPTED,
        IDEMPOTENT,
        LOWER_SEQUENCE,
        SEQUENCE_CONFLICT
    }

    record AcceptedRelease(
            String component,
            String releaseChannel,
            long sequence,
            String manifestFingerprint,
            String digest,
            String version,
            Instant acceptedAt) {
    }
}
