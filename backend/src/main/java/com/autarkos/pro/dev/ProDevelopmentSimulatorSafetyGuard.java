package com.autarkos.pro.dev;

import java.util.Arrays;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class ProDevelopmentSimulatorSafetyGuard {

    static final String ENABLED_PROPERTY = "autark.pro.dev-simulator";
    static final String CONTROL_PLANE_URL_PROPERTY = "autark.pro.dev-simulator-control-plane-url";
    static final String PUBLIC_KEY_PROPERTY = "autark.pro.dev-simulator-public-key";

    public ProDevelopmentSimulatorSafetyGuard(Environment environment) {
        validate(environment);
    }

    static void validate(Environment environment) {
        boolean enabled = environment.getProperty(ENABLED_PROPERTY, Boolean.class, false);
        boolean hasSimulatorMaterial = enabled
                || configured(environment, CONTROL_PLANE_URL_PROPERTY)
                || configured(environment, PUBLIC_KEY_PROPERTY);
        if (!hasSimulatorMaterial) {
            return;
        }

        boolean developmentProfile = Arrays.stream(environment.getActiveProfiles())
                .anyMatch(profile -> "dev".equals(profile) || "test".equals(profile));
        if (!developmentProfile) {
            throw new IllegalStateException(
                    "Autark Pro development simulator settings are forbidden outside the dev or test profile.");
        }
        if (!enabled) {
            throw new IllegalStateException(
                    "Autark Pro simulator endpoints or keys require autark.pro.dev-simulator=true.");
        }
        if (!configured(environment, CONTROL_PLANE_URL_PROPERTY)) {
            throw new IllegalStateException(
                    "Autark Pro development simulator requires an explicit control-plane URL.");
        }
    }

    private static boolean configured(Environment environment, String property) {
        String value = environment.getProperty(property);
        return value != null && !value.isBlank();
    }
}
