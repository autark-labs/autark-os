package com.autarkos.marketplace.runtime;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AutarkOsRuntimeProperties.class)
public class RuntimeConfiguration {
}
