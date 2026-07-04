package com.autarkos.pro;

import java.time.Instant;

import com.autarkos.pro.models.ProRemoteModels;

public interface ProRemoteClient {

    ProRemoteModels.RegisterInstallResponse registerInstall(ProRemoteModels.RegisterInstallRequest request);

    ProRemoteModels.RedeemLicenseResponse redeemLicense(ProRemoteModels.RedeemLicenseRequest request);

    ProRemoteModels.HeartbeatResponse submitHeartbeat(ProRemoteModels.HeartbeatRequest request);

    ProRemoteModels.ProFeedResponse proFeed(Instant since);
}
