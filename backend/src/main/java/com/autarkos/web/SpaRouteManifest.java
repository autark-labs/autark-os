package com.autarkos.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.LinkedHashSet;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * The single server-side view of the browser routes declared for the React
 * application. The frontend imports this same resource at build time.
 */
@Component
public final class SpaRouteManifest {

    private static final String RESOURCE = "/spa-route-manifest.json";

    private final Set<String> documentPaths;

    public SpaRouteManifest() {
        try (InputStream input = SpaRouteManifest.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("SPA route manifest is missing from the application resources");
            }

            JsonNode manifest = new ObjectMapper().readTree(input);
            LinkedHashSet<String> paths = new LinkedHashSet<>();
            addValues(manifest.path("routes"), paths);
            addValues(manifest.path("specialRoutes"), paths);
            addNames(manifest.path("aliases"), paths);
            documentPaths = Set.copyOf(paths);
        } catch (IOException exception) {
            throw new UncheckedIOException("Unable to read the SPA route manifest", exception);
        }
    }

    public boolean contains(String path) {
        return documentPaths.contains(path);
    }

    Set<String> documentPaths() {
        return documentPaths;
    }

    private static void addValues(JsonNode objectNode, Set<String> paths) {
        objectNode.elements().forEachRemaining(value -> paths.add(value.asText()));
    }

    private static void addNames(JsonNode objectNode, Set<String> paths) {
        objectNode.fieldNames().forEachRemaining(paths::add);
    }
}
