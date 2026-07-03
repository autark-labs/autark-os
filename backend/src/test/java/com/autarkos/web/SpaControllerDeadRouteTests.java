package com.autarkos.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

class SpaControllerDeadRouteTests {

    @Test
    void spaFallbackDoesNotKeepDeletedProductRoutesAlive() throws NoSuchMethodException {
        GetMapping mapping = SpaController.class.getMethod("index").getAnnotation(GetMapping.class);

        assertThat(Arrays.asList(mapping.value()))
                .doesNotContain("/devices", "/updates", "/placeholder");
    }

    @Test
    void spaFallbackKeepsCurrentMvpRoutesReloadable() throws NoSuchMethodException {
        GetMapping mapping = SpaController.class.getMethod("index").getAnnotation(GetMapping.class);

        assertThat(Arrays.asList(mapping.value()))
                .contains("/", "/home", "/setup", "/apps", "/discover", "/access", "/storage", "/backups", "/activity", "/settings", "/diagnostics");
    }
}
