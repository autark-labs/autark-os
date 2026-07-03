package com.autarkos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class AutarkOsApplication {

    public static void main(String[] args) {
        SpringApplication.run(AutarkOsApplication.class, args);
    }
}
