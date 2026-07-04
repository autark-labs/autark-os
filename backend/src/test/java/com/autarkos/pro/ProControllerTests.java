package com.autarkos.pro;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.RecordComponent;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.autarkos.marketplace.runtime.AutarkOsRuntimeProperties;
import com.autarkos.marketplace.runtime.RuntimeLayout;
import com.autarkos.pro.models.ProModels;
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

    @Test
    void returnsPrivacyPayloadPreview() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));

        var preview = controller.privacyPayloadPreview();

        assertThat(preview.payload()).containsEntry("generatedAt", Instant.parse("2026-07-04T10:00:00Z"));
        assertThat(preview.payload()).containsKey("appHealthCounts");
        assertThat(preview.neverSends()).contains("secrets", "raw logs");
    }

    @Test
    void sendsManualHeartbeat() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));
        controller.register();

        var status = controller.sendHeartbeatNow();

        assertThat(status.lastHeartbeatAt()).isEqualTo(Instant.parse("2026-07-04T10:01:00Z"));
        assertThat(status.lastHeartbeatResult()).isEqualTo("accepted");
    }

    @Test
    void syncsProFeed() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));
        controller.register();

        var status = controller.syncProFeed();

        assertThat(status.lastFeedSyncAt()).isEqualTo(Instant.parse("2026-07-04T10:02:00Z"));
        assertThat(status.feedAdvisoryCount()).isEqualTo(1);
    }

    @Test
    void disablesProLocally() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));
        controller.redeemLicense(new ProController.RedeemLicenseRequest("AUTARK-PRO-CONTROLLER"));

        var status = controller.disableLocally();

        assertThat(status.enabled()).isFalse();
        assertThat(status.mode()).isEqualTo("free");
        assertThat(status.registered()).isTrue();
        assertThat(status.entitlementStatus()).isEqualTo("active");
    }

    @Test
    void completesLocalProLeanSliceFlowAndReloadsWithoutExposingToken() {
        ProSettingsRepository repository = JpaTestRepositories.proSettingsRepository(runtimeLayout());
        ProController controller = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T10:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));

        assertThat(controller.status().registered()).isFalse();

        var registered = controller.register();
        assertThat(registered.registered()).isTrue();
        assertThat(registered.installId()).isEqualTo("ins_controller");

        var activated = controller.redeemLicense(new ProController.RedeemLicenseRequest("AUTARK-PRO-CONTROLLER"));
        assertThat(activated.enabled()).isTrue();
        assertThat(activated.mode()).isEqualTo("accountless");
        assertThat(activated.entitlementStatus()).isEqualTo("active");

        var preview = controller.privacyPayloadPreview();
        assertThat(preview.payload()).containsEntry("installId", "ins_controller");
        assertThat(String.valueOf(preview.payload())).doesNotContain("tok_controller");

        var heartbeat = controller.sendHeartbeatNow();
        assertThat(heartbeat.lastHeartbeatResult()).isEqualTo("accepted");

        var feed = controller.syncProFeed();
        assertThat(feed.lastFeedSyncAt()).isEqualTo(Instant.parse("2026-07-04T10:02:00Z"));
        assertThat(feed.feedAdvisoryCount()).isEqualTo(1);
        assertThat(feed.feedDeviceProfileCount()).isEqualTo(2);
        assertThat(feed.feedBlueprintCount()).isEqualTo(3);

        var disabled = controller.disableLocally();
        assertThat(disabled.enabled()).isFalse();
        assertThat(disabled.mode()).isEqualTo("free");
        assertThat(disabled.registered()).isTrue();
        assertThat(disabled.entitlementStatus()).isEqualTo("active");
        assertThat(publicStatusFields()).doesNotContain("installToken", "installTokenProtected");

        ProController reloadedController = new ProController(new ProService(
                repository,
                () -> Instant.parse("2026-07-04T11:00:00Z"),
                false,
                new ControllerRemoteClient(),
                () -> "1.2.3"));
        var reloaded = reloadedController.status();

        assertThat(reloaded.enabled()).isFalse();
        assertThat(reloaded.mode()).isEqualTo("free");
        assertThat(reloaded.registered()).isTrue();
        assertThat(reloaded.installId()).isEqualTo("ins_controller");
        assertThat(reloaded.entitlementStatus()).isEqualTo("active");
        assertThat(reloaded.lastHeartbeatResult()).isEqualTo("accepted");
        assertThat(reloaded.feedAdvisoryCount()).isEqualTo(1);
        assertThat(repository.settings()).hasValueSatisfying(settings -> {
            assertThat(settings.installTokenProtected()).isEqualTo("tok_controller");
        });
    }

    private RuntimeLayout runtimeLayout() {
        AutarkOsRuntimeProperties properties = new AutarkOsRuntimeProperties();
        properties.setRuntimeRoot(runtimeRoot.toString());
        return new RuntimeLayout(properties);
    }

    private static java.util.List<String> publicStatusFields() {
        return Arrays.stream(ProModels.ProStatus.class.getRecordComponents())
                .map(RecordComponent::getName)
                .toList();
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
            return new ProRemoteModels.HeartbeatResponse(
                    "accepted",
                    Instant.parse("2026-07-04T10:01:00Z"),
                    "Heartbeat accepted.");
        }

        @Override
        public ProRemoteModels.ProFeedResponse proFeed(Instant since) {
            return new ProRemoteModels.ProFeedResponse(
                    Instant.parse("2026-07-04T10:02:00Z"),
                    java.util.List.of(new ProRemoteModels.ProFeedItem(
                            "controller-feed-item",
                            "Controller feed item",
                            "Feed sync works.",
                            "info",
                            Instant.parse("2026-07-04T10:02:00Z"))),
                    1,
                    2,
                    3);
        }
    }
}
