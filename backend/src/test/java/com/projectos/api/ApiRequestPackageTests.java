package com.projectos.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.projectos.automation.api.AutomationRecipeUpdateRequest;
import com.projectos.backups.api.RestoreRequest;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.network.api.DeviceTrustUpdateRequest;
import com.projectos.system.api.OnboardingUpdateRequest;
import com.projectos.system.api.OnboardingState;
import com.projectos.system.api.RuntimeMigrationPlan;
import com.projectos.system.api.RuntimeMigrationPlanRequest;
import com.projectos.system.api.SupportBundle;
import com.projectos.system.api.SupportCommand;
import com.projectos.system.api.SupportDomainSummary;
import com.projectos.system.api.SupportFinding;
import com.projectos.system.api.SupportLogLine;
import com.projectos.system.api.SupportRedactionRule;
import com.projectos.system.api.SupportSummary;
import com.projectos.system.api.SystemDoctorStatus;
import com.projectos.system.api.SystemReadinessGroup;
import com.projectos.system.api.SystemReadinessStatus;
import com.projectos.system.api.SystemSetupCheck;
import com.projectos.system.api.SystemSetupStatus;

class ApiRequestPackageTests {

    @Test
    void controllerRequestsLiveAtTheApiBoundary() {
        assertThat(AutomationRecipeUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.automation.api");
        assertThat(RestoreRequest.class.getPackageName()).isEqualTo("com.projectos.backups.api");
        assertThat(InstallOptionsRequest.class.getPackageName()).isEqualTo("com.projectos.marketplace.api");
        assertThat(DeviceTrustUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.network.api");
        assertThat(OnboardingUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(RuntimeMigrationPlanRequest.class.getPackageName()).isEqualTo("com.projectos.system.api");
    }

    @Test
    void storageMigrationResponsesLiveAtTheApiBoundary() {
        assertThat(RuntimeMigrationPlan.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(RuntimeMigrationPlan.Step.class.getPackageName()).isEqualTo("com.projectos.system.api");
    }

    @Test
    void systemSetupAndOnboardingResponsesLiveAtTheApiBoundary() {
        assertThat(OnboardingState.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SystemDoctorStatus.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SystemReadinessGroup.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SystemReadinessStatus.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SystemSetupCheck.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SystemSetupStatus.class.getPackageName()).isEqualTo("com.projectos.system.api");
    }

    @Test
    void supportResponsesLiveAtTheApiBoundary() {
        assertThat(SupportBundle.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportCommand.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportDomainSummary.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportFinding.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportLogLine.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportRedactionRule.class.getPackageName()).isEqualTo("com.projectos.system.api");
        assertThat(SupportSummary.class.getPackageName()).isEqualTo("com.projectos.system.api");
    }
}
