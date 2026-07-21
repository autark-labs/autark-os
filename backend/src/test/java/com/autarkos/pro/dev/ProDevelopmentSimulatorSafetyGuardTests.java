package com.autarkos.pro.dev;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ProDevelopmentSimulatorSafetyGuardTests {

    @Test
    void productionRejectsSimulatorFlagEndpointAndKeyIndividually() {
        assertRejected(ProDevelopmentSimulatorSafetyGuard.ENABLED_PROPERTY, "true");
        assertRejected(ProDevelopmentSimulatorSafetyGuard.CONTROL_PLANE_URL_PROPERTY, "http://127.0.0.1:9191/control-plane");
        assertRejected(ProDevelopmentSimulatorSafetyGuard.PUBLIC_KEY_PROPERTY, "test-only-public-key");
    }

    @Test
    void developmentRequiresExplicitFlagAndControlPlaneEndpoint() {
        MockEnvironment missingFlag = new MockEnvironment()
                .withProperty(ProDevelopmentSimulatorSafetyGuard.CONTROL_PLANE_URL_PROPERTY, "http://127.0.0.1:9191/control-plane");
        missingFlag.setActiveProfiles("dev");

        assertThatThrownBy(() -> ProDevelopmentSimulatorSafetyGuard.validate(missingFlag))
                .hasMessageContaining("autark.pro.dev-simulator=true");

    }

    @Test
    void explicitDevelopmentAndTestProfilesAllowCompleteSimulatorConfiguration() {
        assertThatCode(() -> ProDevelopmentSimulatorSafetyGuard.validate(completeEnvironment("dev")))
                .doesNotThrowAnyException();
        assertThatCode(() -> ProDevelopmentSimulatorSafetyGuard.validate(completeEnvironment("test")))
                .doesNotThrowAnyException();
    }

    @Test
    void productionWithoutSimulatorMaterialStartsNormally() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("production");

        assertThatCode(() -> ProDevelopmentSimulatorSafetyGuard.validate(environment))
                .doesNotThrowAnyException();
    }

    private void assertRejected(String property, String value) {
        MockEnvironment environment = new MockEnvironment().withProperty(property, value);
        environment.setActiveProfiles("production");

        assertThatThrownBy(() -> ProDevelopmentSimulatorSafetyGuard.validate(environment))
                .hasMessageContaining("forbidden outside the dev or test profile");
    }

    private MockEnvironment completeEnvironment(String profile) {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(ProDevelopmentSimulatorSafetyGuard.ENABLED_PROPERTY, "true")
                .withProperty(ProDevelopmentSimulatorSafetyGuard.CONTROL_PLANE_URL_PROPERTY, "http://127.0.0.1:9191/control-plane");
        environment.setActiveProfiles(profile);
        return environment;
    }
}
