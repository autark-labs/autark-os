package com.projectos.marketplace.runtime;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ProjectOsRuntimeProperties.class)
public class RuntimeConfiguration {
}
