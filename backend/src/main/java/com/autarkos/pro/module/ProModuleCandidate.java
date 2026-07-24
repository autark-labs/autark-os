package com.autarkos.pro.module;

import java.time.Instant;

import com.autarkos.pro.model.ProReleaseManifest;
import com.autarkos.pro.model.SignedEnvelopeV1;

public record ProModuleCandidate(
        ProReleaseManifest manifest,
        String fingerprint,
        SignedEnvelopeV1 envelope,
        Instant verifiedServerTime) {
}
