package com.autarkos.pro.change;

import java.util.List;

import com.autarkos.pro.model.NormalizedHostSnapshot;

public record ProChangeSafetyRequest(
        String schemaVersion,
        String planId,
        String operation,
        String targetResourceRef,
        String currentVersion,
        String targetVersion,
        List<String> changes,
        boolean safetyCheckpointRequired,
        NormalizedHostSnapshot snapshot) {
}
