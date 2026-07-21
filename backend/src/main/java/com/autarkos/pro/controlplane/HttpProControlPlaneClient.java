package com.autarkos.pro.controlplane;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.autarkos.pro.model.DeviceRegistrationRequest;
import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

@Service
public class HttpProControlPlaneClient implements ProControlPlaneClient {

    private static final int MAX_RESPONSE_BYTES = 64 * 1024;

    private final URI baseUri;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final Duration requestTimeout;

    @Autowired
    public HttpProControlPlaneClient(
            @Value("${autark.pro.control-plane-url:}") String controlPlaneUrl,
            @Value("${autark.pro.control-plane-timeout:10s}") Duration requestTimeout) {
        this(
                controlPlaneUrl,
                requestTimeout,
                HttpClient.newBuilder()
                        .connectTimeout(requestTimeout)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    HttpProControlPlaneClient(
            String controlPlaneUrl,
            Duration requestTimeout,
            HttpClient httpClient) {
        this.baseUri = validateBaseUri(controlPlaneUrl);
        this.requestTimeout = requestTimeout;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper(
                JsonFactory.builder()
                        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .build())
                .registerModule(new JavaTimeModule())
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    @Override
    public ActivationTicket startActivation(String activationCode, UUID requestId) {
        requireSecret(activationCode, "Activation code");
        return post(
                "/activate",
                new ActivationRequest("1", "activation_code", activationCode),
                null,
                requestId,
                ActivationTicket.class);
    }

    @Override
    public RegistrationChallenge createRegistrationChallenge(
            String activationTicket,
            String deviceId,
            UUID requestId) {
        requireSecret(activationTicket, "Activation ticket");
        return post(
                "/device-challenges",
                new ChallengeRequest("1", "register", deviceId),
                activationTicket,
                requestId,
                RegistrationChallenge.class);
    }

    @Override
    public RegistrationChallenge createDeviceChallenge(
            ChallengePurpose purpose,
            String deviceId,
            UUID requestId) {
        if (purpose == null) {
            throw new IllegalArgumentException("Challenge purpose is required.");
        }
        return post(
                "/device-challenges",
                new ChallengeRequest("1", purpose.wireValue(), deviceId),
                null,
                requestId,
                RegistrationChallenge.class);
    }

    @Override
    public RegistrationResult registerDevice(
            DeviceRegistrationRequest request,
            UUID requestId) {
        if (request == null) {
            throw new IllegalArgumentException("Registration request is required.");
        }
        return post("/devices-register", request, null, requestId, RegistrationResult.class);
    }

    @Override
    public EntitlementDocuments renewEntitlements(
            DeviceProofRequest request,
            UUID requestId) {
        if (request == null) {
            throw new IllegalArgumentException("Device proof request is required.");
        }
        return post(
                "/entitlements-renew",
                request,
                null,
                requestId,
                EntitlementDocuments.class);
    }

    @Override
    public ReleaseCheckResult checkRelease(
            DeviceProofRequest request,
            UUID requestId) {
        if (request == null) {
            throw new IllegalArgumentException("Device proof request is required.");
        }
        return post(
                "/releases-check",
                request,
                null,
                requestId,
                ReleaseCheckResult.class);
    }

    @Override
    public RegistryCredentialResponse issueRegistryCredential(
            RegistryCredentialRequest request,
            UUID requestId) {
        if (request == null) {
            throw new IllegalArgumentException(
                    "Registry credential request is required.");
        }
        return post(
                "/registry-token",
                request,
                null,
                requestId,
                RegistryCredentialResponse.class);
    }

    private <T> T post(
            String path,
            Object body,
            String bearerToken,
            UUID requestId,
            Class<T> responseType) {
        if (requestId == null) {
            throw new IllegalArgumentException("Request ID is required.");
        }
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(baseUri.resolve(path.substring(1)))
                    .timeout(requestTimeout)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("X-Request-ID", requestId.toString())
                    .POST(HttpRequest.BodyPublishers.ofByteArray(objectMapper.writeValueAsBytes(body)));
            if (bearerToken != null) {
                request.header("Authorization", "Bearer " + bearerToken);
            }

            HttpResponse<byte[]> response = httpClient.send(
                    request.build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            byte[] responseBody = response.body();
            try {
                if (responseBody.length > MAX_RESPONSE_BYTES) {
                    throw failure(
                            "invalid_response",
                            "Control-plane response is too large.");
                }
                if (response.statusCode() < 200
                        || response.statusCode() >= 300) {
                    throw remoteError(responseBody);
                }
                T decoded = objectMapper.readValue(responseBody, responseType);
                requireVersion(decoded);
                requireRequestId(decoded, requestId);
                return decoded;
            } finally {
                Arrays.fill(responseBody, (byte) 0);
            }
        } catch (ProControlPlaneException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure(
                    "control_plane_interrupted",
                    "Control-plane request was interrupted.",
                    exception);
        } catch (IOException | IllegalArgumentException exception) {
            throw failure(
                    "control_plane_unavailable",
                    "Control plane is unavailable or returned an invalid response.",
                    exception);
        }
    }

    private ProControlPlaneException remoteError(byte[] responseBody) {
        try {
            ErrorResponse decoded =
                    objectMapper.readValue(responseBody, ErrorResponse.class);
            if (decoded.error() == null
                    || decoded.error().code() == null
                    || decoded.error().message() == null) {
                throw new IOException("missing error body");
            }
            return failure(decoded.error().code(), decoded.error().message());
        } catch (IOException exception) {
            return failure(
                    "control_plane_error",
                    "Control plane rejected the request.",
                    exception);
        }
    }

    private static void requireVersion(Object decoded) {
        String version = switch (decoded) {
            case ActivationTicket value -> value.schemaVersion();
            case RegistrationChallenge value -> value.schemaVersion();
            case RegistrationResult value -> value.schemaVersion();
            case EntitlementDocuments value -> value.schemaVersion();
            case ReleaseCheckResult value -> value.schemaVersion();
            case RegistryCredentialResponse value -> value.schemaVersion();
            default -> null;
        };
        if (!"1".equals(version)) {
            throw failure("unsupported_schema", "Control plane returned an unsupported contract version.");
        }
    }

    private static void requireRequestId(Object decoded, UUID expectedRequestId) {
        UUID responseRequestId = switch (decoded) {
            case ActivationTicket value -> value.requestId();
            case RegistrationChallenge value -> value.requestId();
            case RegistrationResult value -> value.requestId();
            case EntitlementDocuments value -> value.requestId();
            case ReleaseCheckResult value -> value.requestId();
            case RegistryCredentialResponse value -> value.requestId();
            default -> null;
        };
        if (!expectedRequestId.equals(responseRequestId)) {
            throw failure(
                    "request_id_mismatch",
                    "Control plane returned a mismatched request ID.");
        }
    }

    private static URI validateBaseUri(String value) {
        if (value == null || value.isBlank()) {
            return URI.create("https://control-plane.invalid/functions/v1/");
        }
        URI uri;
        try {
            uri = URI.create(value.endsWith("/") ? value : value + "/");
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("Autark Pro control-plane URL is invalid.", exception);
        }
        boolean https = "https".equalsIgnoreCase(uri.getScheme());
        boolean loopbackHttp = "http".equalsIgnoreCase(uri.getScheme()) && isLoopback(uri.getHost());
        if ((!https && !loopbackHttp)
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || uri.getQuery() != null) {
            throw new IllegalStateException(
                    "Autark Pro control-plane URL must use HTTPS or loopback HTTP without embedded credentials.");
        }
        return uri;
    }

    private static boolean isLoopback(String host) {
        if (host == null) {
            return false;
        }
        try {
            return InetAddress.getByName(host).isLoopbackAddress();
        } catch (IOException exception) {
            return false;
        }
    }

    private static void requireSecret(String value, String label) {
        if (value == null || value.isBlank() || value.length() > 4096) {
            throw new IllegalArgumentException(label + " is invalid.");
        }
    }

    private static ProControlPlaneException failure(String code, String message) {
        return new ProControlPlaneException(code, message);
    }

    private static ProControlPlaneException failure(
            String code,
            String message,
            Throwable cause) {
        return new ProControlPlaneException(code, message, cause);
    }

    private record ActivationRequest(
            String schemaVersion,
            String method,
            String value) {
    }

    private record ChallengeRequest(
            String schemaVersion,
            String purpose,
            String deviceId) {
    }

    private record ErrorResponse(ErrorBody error) {
    }

    private record ErrorBody(
            String code,
            String message,
            UUID requestId) {
    }
}
