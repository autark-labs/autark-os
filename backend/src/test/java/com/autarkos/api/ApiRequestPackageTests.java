package com.autarkos.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.autarkos.backups.api.RestoreRequest;
import com.autarkos.marketplace.api.InstallOptionsRequest;
import com.autarkos.network.api.DeviceTrustUpdateRequest;
import com.autarkos.system.api.OnboardingUpdateRequest;
import com.autarkos.system.api.OnboardingState;
import com.autarkos.system.api.SupportBundle;
import com.autarkos.system.api.SupportCommand;
import com.autarkos.system.api.SupportDomainSummary;
import com.autarkos.system.api.SupportFinding;
import com.autarkos.system.api.SupportLogLine;
import com.autarkos.system.api.SupportRedactionRule;
import com.autarkos.system.api.SupportSummary;
import com.autarkos.system.api.SystemDoctorStatus;
import com.autarkos.system.api.SystemReadinessGroup;
import com.autarkos.system.api.SystemReadinessStatus;
import com.autarkos.system.api.SystemSetupCheck;
import com.autarkos.system.api.SystemSetupStatus;

class ApiRequestPackageTests {

    @Test
    void controllerRequestsLiveAtTheApiBoundary() {
        assertThat(RestoreRequest.class.getPackageName()).isEqualTo("com.autarkos.backups.api");
        assertThat(InstallOptionsRequest.class.getPackageName()).isEqualTo("com.autarkos.marketplace.api");
        assertThat(DeviceTrustUpdateRequest.class.getPackageName()).isEqualTo("com.autarkos.network.api");
        assertThat(OnboardingUpdateRequest.class.getPackageName()).isEqualTo("com.autarkos.system.api");
    }

    @Test
    void systemSetupAndOnboardingResponsesLiveAtTheApiBoundary() {
        assertThat(OnboardingState.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SystemDoctorStatus.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SystemReadinessGroup.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SystemReadinessStatus.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SystemSetupCheck.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SystemSetupStatus.class.getPackageName()).isEqualTo("com.autarkos.system.api");
    }

    @Test
    void supportResponsesLiveAtTheApiBoundary() {
        assertThat(SupportBundle.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportCommand.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportDomainSummary.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportFinding.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportLogLine.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportRedactionRule.class.getPackageName()).isEqualTo("com.autarkos.system.api");
        assertThat(SupportSummary.class.getPackageName()).isEqualTo("com.autarkos.system.api");
    }
}
