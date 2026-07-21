package com.autarkos.pro.dev;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile({"dev", "test"})
@ConditionalOnProperty(name = "autark.pro.dev-simulator", havingValue = "true")
public class ProDevelopmentSimulatorConfiguration {

    @Bean
    ProDevelopmentSimulatorSettings proDevelopmentSimulatorSettings(
            @Value("${autark.pro.dev-simulator-control-plane-url}") String controlPlaneUrl,
            @Value("${autark.pro.dev-simulator-public-key:}") String publicKey) {
        return new ProDevelopmentSimulatorSettings(controlPlaneUrl, publicKey);
    }

    public record ProDevelopmentSimulatorSettings(
            String controlPlaneUrl,
            String publicKey) {
    }
}
