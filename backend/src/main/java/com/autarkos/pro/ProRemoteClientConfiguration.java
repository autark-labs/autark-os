package com.autarkos.pro;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ProProperties.class)
public class ProRemoteClientConfiguration {

    @Bean
    public ProRemoteClient proRemoteClient(ProProperties properties) {
        if (!properties.remoteApiConfigured()) {
            return new MockProRemoteClient();
        }
        return new SupabaseProRemoteClient(
                properties.getApiBaseUrl(),
                properties.getHeartbeatTimeoutSeconds(),
                properties.getFeedTimeoutSeconds());
    }
}
