package com.projectos.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.projectos.automation.api.AutomationRecipeUpdateRequest;
import com.projectos.backups.api.RestoreRequest;
import com.projectos.marketplace.api.InstallOptionsRequest;
import com.projectos.network.api.DeviceTrustUpdateRequest;
import com.projectos.system.api.OnboardingUpdateRequest;

class ApiRequestPackageTests {

    @Test
    void controllerRequestsLiveAtTheApiBoundary() {
        assertThat(AutomationRecipeUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.automation.api");
        assertThat(RestoreRequest.class.getPackageName()).isEqualTo("com.projectos.backups.api");
        assertThat(InstallOptionsRequest.class.getPackageName()).isEqualTo("com.projectos.marketplace.api");
        assertThat(DeviceTrustUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.network.api");
        assertThat(OnboardingUpdateRequest.class.getPackageName()).isEqualTo("com.projectos.system.api");
    }
}
