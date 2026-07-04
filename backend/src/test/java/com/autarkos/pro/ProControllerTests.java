package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.models.ProRemoteModels;
import com.autarkos.testsupport.JpaTestRepositories;

class ProControllerTests {

    @TempDir
    Path runtimeRoot;

    @Test
    void returnsLocalProStatus() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(repository, () -> Instant.parse("2026-07-04T10:00:00Z"), false));

        assertThat(controller.status().mode()).isEqualTo("free");
        assertThat(controller.status().registered()).isFalse();
        assertThat(controller.status().remoteApiConfigured()).isFalse();
    }

    @Test
    void registersLocalInstall() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));
        var status = controller.register();

        assertThat(status.enabled()).isTrue();
        assertThat(status.installId()).isEqualTo("ins_controller");
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.installTokenProtected()).isEqualTo("tok_controller");
        });
    }

    @Test
    void redeemsAccountlessLicense() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));

        var status = controller.redeemLicense(new ProController.RedeemLicenseRequest(" AUTARK-PRO-CONTROLLER "));

        assertThat(status.enabled()).isTrue();
        assertThat(status.mode()).isEqualTo("accountless");
        assertThat(status.entitlementStatus()).isEqualTo("active");
        assertThat(status.installId()).isEqualTo("ins_controller");
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static class ControllerRemoteClient implements ProRemoteClient {
        @Override
        public ProRemoteModels.RegisterInstallResponse registerInstall(ProRemoteModels.RegisterInstallRequest request) {
            return new ProRemoteModels.RegisterInstallResponse("ins_controller", "tok_controller", Instant.parse("2026-07-04T10:00:00Z"));
        }

        @Override
        public ProRemoteModels.RedeemLicenseResponse redeemLicense(ProRemoteModels.RedeemLicenseRequest request) {
            return new ProRemoteModels.RedeemLicenseResponse(
                    "autark_pro_controller",
                    "active",
                    Instant.parse("2027-07-04T00:00:00Z"),
                    "License accepted.");
        }

        @Override
        public ProRemoteModels.HeartbeatResponse submitHeartbeat(ProRemoteModels.HeartbeatRequest request) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ProRemoteModels.ProFeedResponse proFeed(Instant since) {
            throw new UnsupportedOperationException();
        }
    }
}
