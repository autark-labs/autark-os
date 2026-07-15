package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;

class ProjectVersionServiceTests {

    @Test
    void versionStatusPointsUsersToTheUnifiedUpdaterWithoutClaimingAnUpdateExists() {
        AutarkOsRuntimeProperties runtimeProperties = new AutarkOsRuntimeProperties();
        runtimeProperties.setRuntimeRoot("/tmp/autark-os-version-test");
        ProjectSettingsService settingsService = mock(ProjectSettingsService.class);
        when(settingsService.current()).thenReturn(ProjectSettings.defaults("autark-os"));
        InstanceIdentityService identityService = mock(InstanceIdentityService.class);
        when(identityService.current()).thenReturn(new AutarkOsIdentity(
                "instance-1",
                "instance-1",
                "/tmp/autark-os-version-test",
                "runtime-hash",
                Instant.parse("2026-07-14T12:00:00Z"),
                1));

        ProjectVersionInfo version = new ProjectVersionService(
                new RuntimeLayout(runtimeProperties),
                settingsService,
                identityService).info();

        assertThat(version.updateStatus()).isEqualTo("check_required");
        assertThat(version.updateMessage())
                .contains("autark-os update")
                .doesNotContain("cannot check for or install updates");
    }
}
