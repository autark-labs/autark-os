package com.autarkos.pro.agent;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.autarkos.pro.model.AgentStatus;
import com.autarkos.pro.model.NormalizedHostSnapshot;
import com.autarkos.pro.runtime.ProAgentApiCredentialStore;
import com.autarkos.extensions.ExtensionSurfaceEnvelope;
import com.autarkos.extensions.ExtensionSurfaceRequest;
import com.autarkos.extensions.ExtensionUiManifest;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@Component
public final class HttpProAgentClient implements ProAgentClient {

    private static final int STATUS_LIMIT = 16 * 1024;
    private static final int SURFACE_LIMIT = 1024 * 1024;
    private static final int UI_MANIFEST_LIMIT = 16 * 1024;
    private static final int UI_ASSET_LIMIT = 2 * 1024 * 1024;
    private static final Pattern UI_ASSET_NAME =
            Pattern.compile("^[a-zA-Z0-9._-]{1,128}$");
    private static final Pattern SURFACE_ID =
            Pattern.compile("^[a-z][a-z0-9.-]{1,127}$");
    private static final Pattern SEMVER = Pattern.compile(
            "^[0-9]+\\.[0-9]+\\.[0-9]+"
                    + "(?:-[0-9A-Za-z.-]+)?"
                    + "(?:\\+[0-9A-Za-z.-]+)?$");

    private final ProAgentApiCredentialStore credentials;
    private final ProAgentContractValidator validator;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final Duration requestTimeout;

    @Autowired
    public HttpProAgentClient(
            ProAgentApiCredentialStore credentials,
            ProAgentContractValidator validator,
            @Value("${autark.pro.agent-request-timeout:2s}")
                    Duration requestTimeout) {
        this(
                credentials,
                validator,
                requestTimeout,
                HttpClient.newBuilder()
                        .connectTimeout(requestTimeout)
                        .followRedirects(
                                HttpClient.Redirect.NEVER)
                        .build());
    }

    HttpProAgentClient(
            ProAgentApiCredentialStore credentials,
            ProAgentContractValidator validator,
            Duration requestTimeout,
            HttpClient httpClient) {
        this.credentials = Objects.requireNonNull(credentials);
        this.validator = Objects.requireNonNull(validator);
        this.requestTimeout = requireTimeout(requestTimeout);
        this.httpClient = Objects.requireNonNull(httpClient);
        this.objectMapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(
                                StreamReadFeature
                                        .STRICT_DUPLICATE_DETECTION)
                        .build())
                .registerModule(new JavaTimeModule())
                .disable(
                        SerializationFeature
                                .WRITE_DATES_AS_TIMESTAMPS)
                .disable(
                        DeserializationFeature
                                .ACCEPT_FLOAT_AS_INT)
                .enable(
                        DeserializationFeature
                                .FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(
                        DeserializationFeature
                                .FAIL_ON_MISSING_CREATOR_PROPERTIES)
                .enable(
                        DeserializationFeature
                                .FAIL_ON_TRAILING_TOKENS);
    }

    @Override
    public AgentStatus status(ProAgentEndpoint endpoint) {
        AgentStatus status = exchange(
                endpoint,
                "v1/status",
                null,
                STATUS_LIMIT,
                AgentStatus.class);
        validator.requireStatus(status);
        return status;
    }

    @Override
    public ExtensionUiManifest uiManifest(ProAgentEndpoint endpoint) {
        ExtensionUiManifest manifest = exchange(
                endpoint,
                "v1/ui/manifest",
                null,
                UI_MANIFEST_LIMIT,
                ExtensionUiManifest.class);
        requireManifest(manifest);
        return manifest;
    }

    @Override
    public byte[] uiAsset(
            ProAgentEndpoint endpoint,
            String assetName) {
        if (assetName == null || !UI_ASSET_NAME.matcher(assetName).matches()) {
            throw new ProAgentClientException(
                    "agent_request_invalid",
                    "Extension asset request is invalid.");
        }
        return exchangeBytes(
                endpoint,
                "v1/ui/assets/" + assetName,
                UI_ASSET_LIMIT,
                "text/javascript");
    }

    @Override
    public ExtensionSurfaceEnvelope renderSurface(
            ProAgentEndpoint endpoint,
            String surface,
            NormalizedHostSnapshot snapshot,
            String continuationToken) {
        if (surface == null || snapshot == null) {
            throw new ProAgentClientException(
                    "agent_request_invalid",
                    "Extension surface request is invalid.");
        }
        byte[] body;
        try {
            body = objectMapper.writeValueAsBytes(
                    new ExtensionSurfaceRequest(
                            "1",
                            surface,
                            snapshot,
                            continuationToken));
        } catch (IOException exception) {
            throw failure("agent_request_invalid", exception);
        }
        try {
            if (body.length > SURFACE_LIMIT) {
                throw new ProAgentClientException(
                        "agent_request_too_large",
                        "Extension surface request is too large.");
            }
            ExtensionSurfaceEnvelope response = exchange(
                    endpoint,
                    "v1/surfaces/render",
                    body,
                    SURFACE_LIMIT,
                    ExtensionSurfaceEnvelope.class);
            requireSurface(response, surface);
            return response;
        } finally {
            Arrays.fill(body, (byte) 0);
        }
    }

    private <T> T exchange(
            ProAgentEndpoint endpoint,
            String path,
            byte[] requestBody,
            int responseLimit,
            Class<T> responseType) {
        Objects.requireNonNull(endpoint);
        try {
            return credentials.useSecret(secret -> {
                HttpRequest.Builder request = HttpRequest.newBuilder(
                                endpoint.resolve(path))
                        .timeout(requestTimeout)
                        .header("Accept", "application/json")
                        .header(
                                "Authorization",
                                "Bearer " + new String(secret));
                if (requestBody == null) {
                    request.GET();
                } else {
                    request.header(
                                    "Content-Type",
                                    "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers
                                            .ofByteArray(
                                                    requestBody));
                }
                return send(
                        request.build(),
                        responseLimit,
                        responseType);
            });
        } catch (ProAgentClientException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure("agent_unavailable", exception);
        }
    }

    private byte[] exchangeBytes(
            ProAgentEndpoint endpoint,
            String path,
            int responseLimit,
            String expectedContentType) {
        Objects.requireNonNull(endpoint);
        try {
            return credentials.useSecret(secret -> {
                HttpRequest request = HttpRequest.newBuilder(
                                endpoint.resolve(path))
                        .timeout(requestTimeout)
                        .header("Accept", expectedContentType)
                        .header(
                                "Authorization",
                                "Bearer " + new String(secret))
                        .GET()
                        .build();
                return sendBytes(
                        request,
                        responseLimit,
                        expectedContentType);
            });
        } catch (ProAgentClientException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure("agent_unavailable", exception);
        }
    }

    private <T> T send(
            HttpRequest request,
            int responseLimit,
            Class<T> responseType) {
        try {
            HttpResponse<byte[]> response = httpClient.send(
                    request,
                    responseInfo ->
                            new LimitedBodySubscriber(
                                    responseLimit));
            byte[] body = response.body();
            try {
                if (response.statusCode() == 401) {
                    throw new ProAgentClientException(
                            "agent_authentication_failed",
                            "Autark Pro agent authentication failed.");
                }
                if (response.statusCode() < 200
                        || response.statusCode() >= 300) {
                    throw new ProAgentClientException(
                            "agent_request_failed",
                            "Autark Pro agent request failed.");
                }
                if (!jsonContentType(response)) {
                    throw new ProAgentClientException(
                            "agent_response_invalid",
                            "Autark Pro agent returned an invalid response.");
                }
                return objectMapper.readValue(
                        body,
                        responseType);
            } finally {
                Arrays.fill(body, (byte) 0);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("agent_request_interrupted", exception);
        } catch (IOException exception) {
            if (causedByResponseLimit(exception)) {
                throw new ProAgentClientException(
                        "agent_response_too_large",
                        "Autark Pro agent response is too large.");
            }
            throw failure("agent_unavailable", exception);
        } catch (IllegalArgumentException exception) {
            throw failure("agent_unavailable", exception);
        }
    }

    private byte[] sendBytes(
            HttpRequest request,
            int responseLimit,
            String expectedContentType) {
        try {
            HttpResponse<byte[]> response = httpClient.send(
                    request,
                    responseInfo -> new LimitedBodySubscriber(responseLimit));
            if (response.statusCode() == 401) {
                throw new ProAgentClientException(
                        "agent_authentication_failed",
                        "Extension authentication failed.");
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ProAgentClientException(
                        "agent_request_failed",
                        "Extension asset request failed.");
            }
            String contentType = response.headers()
                    .firstValue("Content-Type")
                    .map(value -> value.toLowerCase(Locale.ROOT))
                    .map(value -> value.split(";", 2)[0].trim())
                    .orElse("");
            if (!expectedContentType.equals(contentType)) {
                throw new ProAgentClientException(
                        "agent_response_invalid",
                        "Extension returned an invalid asset.");
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("agent_request_interrupted", exception);
        } catch (IOException exception) {
            if (causedByResponseLimit(exception)) {
                throw new ProAgentClientException(
                        "agent_response_too_large",
                        "Extension response is too large.");
            }
            throw failure("agent_unavailable", exception);
        }
    }

    private static void requireManifest(ExtensionUiManifest manifest) {
        if (manifest == null
                || !"1".equals(manifest.schemaVersion())
                || !"autark-pro".equals(manifest.extensionId())
                || manifest.componentVersion() == null
                || !SEMVER.matcher(manifest.componentVersion()).matches()
                || manifest.entrypoint() == null
                || !UI_ASSET_NAME.matcher(manifest.entrypoint()).matches()
                || manifest.entrypointSha256() == null
                || !manifest.entrypointSha256()
                        .matches("^sha256:[a-f0-9]{64}$")
                || manifest.surfaces() == null
                || manifest.surfaces().isEmpty()
                || manifest.surfaces().size() > 32
                || manifest.surfaces().stream().anyMatch(surface ->
                        surface == null
                                || !SURFACE_ID.matcher(surface).matches())
                || manifest.surfaces().stream().distinct().count()
                        != manifest.surfaces().size()) {
            throw new ProAgentClientException(
                    "agent_response_invalid",
                    "Extension returned an invalid UI manifest.");
        }
    }

    private static void requireSurface(
            ExtensionSurfaceEnvelope response,
            String expectedSurface) {
        if (response == null
                || !"1".equals(response.schemaVersion())
                || !expectedSurface.equals(response.surface())
                || response.payload() == null
                || response.payload().isNull()
                || (response.continuationToken() != null
                        && (response.continuationToken().length() > 262144
                                || !response.continuationToken()
                                        .matches("^[A-Za-z0-9_-]+$")))) {
            throw new ProAgentClientException(
                    "agent_response_invalid",
                    "Extension returned an invalid surface response.");
        }
    }

    private static boolean jsonContentType(
            HttpResponse<?> response) {
        return response.headers()
                .firstValue("Content-Type")
                .map(value -> value.toLowerCase(Locale.ROOT))
                .map(value -> value.split(";", 2)[0].trim())
                .filter("application/json"::equals)
                .isPresent();
    }

    private static Duration requireTimeout(Duration timeout) {
        if (timeout == null
                || timeout.isNegative()
                || timeout.isZero()
                || timeout.compareTo(Duration.ofSeconds(10)) > 0) {
            throw new IllegalArgumentException(
                    "Invalid Pro agent request timeout.");
        }
        return timeout;
    }

    private static ProAgentClientException failure(
            String code,
            Throwable cause) {
        return new ProAgentClientException(
                code,
                "Autark Pro agent is unavailable or returned an invalid response.",
                cause);
    }

    private static boolean causedByResponseLimit(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof ResponseTooLargeException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static final class LimitedBodySubscriber
            implements HttpResponse.BodySubscriber<byte[]> {

        private final int limit;
        private final ByteArrayOutputStream output;
        private final CompletableFuture<byte[]> body =
                new CompletableFuture<>();
        private Flow.Subscription subscription;
        private boolean done;

        private LimitedBodySubscriber(int limit) {
            this.limit = limit;
            this.output = new ByteArrayOutputStream(
                    Math.min(limit, 16 * 1024));
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return body;
        }

        @Override
        public void onSubscribe(
                Flow.Subscription nextSubscription) {
            if (subscription != null) {
                nextSubscription.cancel();
                return;
            }
            subscription = nextSubscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> buffers) {
            if (done) {
                return;
            }
            long incoming = 0;
            for (ByteBuffer buffer : buffers) {
                incoming += buffer.remaining();
                if (incoming > limit - output.size()) {
                    break;
                }
            }
            if (incoming > limit - output.size()) {
                done = true;
                subscription.cancel();
                body.completeExceptionally(
                        new ResponseTooLargeException());
                return;
            }
            for (ByteBuffer buffer : buffers) {
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                output.writeBytes(chunk);
                Arrays.fill(chunk, (byte) 0);
            }
            subscription.request(1);
        }

        @Override
        public void onError(Throwable throwable) {
            if (!done) {
                done = true;
                body.completeExceptionally(throwable);
            }
        }

        @Override
        public void onComplete() {
            if (!done) {
                done = true;
                body.complete(output.toByteArray());
            }
        }
    }

    private static final class ResponseTooLargeException
            extends RuntimeException {
    }
}
