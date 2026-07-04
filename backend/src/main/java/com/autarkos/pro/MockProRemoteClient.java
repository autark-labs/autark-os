package com.autarkos.pro;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

import com.autarkos.pro.models.ProRemoteModels;

public class MockProRemoteClient implements ProRemoteClient {

    @Override
    public ProRemoteModels.RegisterInstallResponse registerInstall(ProRemoteModels.RegisterInstallRequest request) {
        String seed = String.join("|",
                blankToDefault(request.clientName(), "Autark-OS"),
                blankToDefault(request.autarkVersion(), "unknown"),
                blankToDefault(request.platform(), "unknown"));
        String suffix = HexFormat.of().formatHex(seed.getBytes(StandardCharsets.UTF_8)).substring(0, Math.min(12, seed.length() * 2));
        return new ProRemoteModels.RegisterInstallResponse(
                "mock-install-" + suffix.toLowerCase(Locale.ROOT),
                "mock-token-" + suffix.toLowerCase(Locale.ROOT),
                Instant.now().truncatedTo(ChronoUnit.SECONDS));
    }

    @Override
    public ProRemoteModels.RedeemLicenseResponse redeemLicense(ProRemoteModels.RedeemLicenseRequest request) {
        if (request.licenseCode() != null && request.licenseCode().trim().toUpperCase(Locale.ROOT).startsWith("AUTARK-PRO-")) {
            return new ProRemoteModels.RedeemLicenseResponse(
                    "autark_pro_mock",
                    "active",
                    Instant.now().plus(365, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS),
                    "License accepted in local mock mode.");
        }
        return new ProRemoteModels.RedeemLicenseResponse(
                null,
                "none",
                null,
                "This license code was not accepted by the local Pro mock.");
    }

    @Override
    public ProRemoteModels.HeartbeatResponse submitHeartbeat(ProRemoteModels.HeartbeatRequest request) {
        return new ProRemoteModels.HeartbeatResponse(
                "accepted",
                Instant.now().truncatedTo(ChronoUnit.SECONDS),
                "Heartbeat accepted in local mock mode.");
    }

    @Override
    public ProRemoteModels.ProFeedResponse proFeed(Instant since) {
        ProRemoteModels.ProFeedItem welcome = new ProRemoteModels.ProFeedItem(
                "mock-welcome",
                "Autark Pro local mode",
                "This install is using the local Pro mock until a remote API is configured.",
                "info",
                Instant.now().truncatedTo(ChronoUnit.SECONDS));
        return new ProRemoteModels.ProFeedResponse(
                Instant.now().truncatedTo(ChronoUnit.SECONDS),
                List.of(welcome));
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
