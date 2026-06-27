package com.projectos.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AppImageStaticResourceTests {

    @LocalServerPort
    int port;

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Test
    void servesCatalogAppSvgIconsFromBackendOrigin() throws Exception {
        HttpResponse<String> response = get("/app-images/home-assistant.svg");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.headers().firstValue(HttpHeaders.CONTENT_TYPE)).hasValueSatisfying(contentType -> assertThat(contentType).startsWith("image/svg+xml"));
        assertThat(response.body()).contains("<svg");
    }

    @Test
    void missingCatalogAppSvgIconsReturnNotFound() throws Exception {
        HttpResponse<String> response = get("/app-images/not-real.svg");

        assertThat(response.statusCode()).isEqualTo(HttpStatus.NOT_FOUND.value());
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
