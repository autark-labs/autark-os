package com.autarkos.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

class SpaControllerDeadRouteTests {

    @Test
    void onlyTheRootNeedsAnExplicitControllerMapping() throws NoSuchMethodException {
        GetMapping mapping = SpaController.class.getMethod("index").getAnnotation(GetMapping.class);

        assertThat(mapping.value()).containsExactly("/");
    }

    @Test
    void everyManifestRouteIsEligibleForBrowserSpaFallback() throws Exception {
        assertThat(manifestPaths())
                .contains("/pro")
                .doesNotContain("/devices", "/updates", "/placeholder")
                .allSatisfy(path -> assertThat(SpaNavigationFallbackFilter.isSpaNavigationPath(path))
                        .as("%s should be handled as a browser SPA navigation", path)
                        .isTrue());
    }

    private List<String> manifestPaths() throws Exception {
        try (InputStream input = getClass().getResourceAsStream("/spa-route-manifest.json")) {
            assertThat(input).as("SPA route manifest should be packaged with the backend").isNotNull();
            JsonNode manifest = new ObjectMapper().readTree(input);
            List<String> paths = new ArrayList<>();
            addValues(manifest.path("routes"), paths);
            addValues(manifest.path("specialRoutes"), paths);
            addValues(manifest.path("aliases"), paths);
            return paths;
        }
    }

    private void addValues(JsonNode node, List<String> paths) {
        node.elements().forEachRemaining(value -> paths.add(value.asText()));
    }
}
