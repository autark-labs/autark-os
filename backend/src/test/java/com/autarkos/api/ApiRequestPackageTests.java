package com.autarkos.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.autarkos.backups.RestoreModels;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.network.api.DeviceTrustUpdateRequest;
import com.autarkos.system.OnboardingModels;
import com.autarkos.system.SupportModels;
import com.autarkos.system.SystemSetupModels;

class ApiRequestPackageTests {

    @Test
    void controllerRequestsLiveAtTheApiBoundary() {
        assertThat(RestoreModels.RestoreRequest.class.getPackageName()).isEqualTo("com.autarkos.backups");
        assertThat(InstallOptionsRequest.class.getPackageName()).isEqualTo("com.autarkos.marketplace.api");
        assertThat(DeviceTrustUpdateRequest.class.getPackageName()).isEqualTo("com.autarkos.network.api");
        assertThat(OnboardingModels.OnboardingUpdateRequest.class.getPackageName()).isEqualTo("com.autarkos.system");
    }

    @Test
    void systemSetupAndOnboardingResponsesLiveAtTheApiBoundary() {
        assertThat(OnboardingModels.OnboardingState.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SystemSetupModels.SystemDoctorStatus.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SystemSetupModels.SystemReadinessGroup.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SystemSetupModels.SystemReadinessStatus.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SystemSetupModels.SystemSetupCheck.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SystemSetupModels.SystemSetupStatus.class.getPackageName()).isEqualTo("com.autarkos.system");
    }

    @Test
    void supportResponsesLiveAtTheApiBoundary() {
        assertThat(SupportModels.SupportBundle.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportCommand.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportDomainSummary.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportFinding.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportLogLine.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportRedactionRule.class.getPackageName()).isEqualTo("com.autarkos.system");
        assertThat(SupportModels.SupportSummary.class.getPackageName()).isEqualTo("com.autarkos.system");
    }
}
