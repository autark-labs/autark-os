package com.autarkos.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

class SpaControllerDeadRouteTests {

    @Test
    void onlyTheRootNeedsAnExplicitControllerMapping() throws NoSuchMethodException {
        GetMapping mapping = SpaController.class.getMethod("index").getAnnotation(GetMapping.class);

        assertThat(mapping.value()).containsExactly("/");
    }

    @Test
    void everyManifestRouteIsEligibleForBrowserSpaNavigation() {
        SpaRouteManifest manifest = new SpaRouteManifest();

        assertThat(manifest.documentPaths())
                .contains("/pro")
                .doesNotContain("/devices", "/updates", "/placeholder")
                .contains("/overview");
    }
}
