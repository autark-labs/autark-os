package com.autarkos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@ConfigurationPropertiesScan
@SpringBootApplication
public class AutarkOsApplication {

    public static void main(String[] args) {
        if (!"root".equals(System.getProperty("user.name"))) {
            throw new IllegalStateException("Autark-OS requires root. Use scripts/dev-backend.sh or the installed service; do not run Gradle as root.");
        }
        SpringApplication.run(AutarkOsApplication.class, args);
    }
}
