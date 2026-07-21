package com.autarkos.pro.entitlement;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.autarkos.pro.controlplane.ProControlPlaneException;
import com.autarkos.pro.module.ProModuleException;

@RestControllerAdvice(assignableTypes = ProEntitlementController.class)
public class ProEntitlementExceptionHandler {

    @ExceptionHandler(ProEntitlementApiException.class)
    public ResponseEntity<ProApiError> entitlementApi(
            ProEntitlementApiException exception) {
        return ResponseEntity.status(exception.status())
                .body(error(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(ProControlPlaneException.class)
    public ResponseEntity<ProApiError> controlPlane(
            ProControlPlaneException exception) {
        HttpStatus status = controlPlaneStatus(exception.code());
        return ResponseEntity.status(status)
                .body(error(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(ProModuleException.class)
    public ResponseEntity<ProApiError> module(
            ProModuleException exception) {
        HttpStatus status = switch (exception.code()) {
            case "module_update_unauthorized",
                    "retained_use_update_suppressed" ->
                    HttpStatus.FORBIDDEN;
            case "module_operation_in_progress",
                    "invalid_module_transition" ->
                    HttpStatus.CONFLICT;
            case "module_runtime_unavailable" ->
                    HttpStatus.SERVICE_UNAVAILABLE;
            default -> HttpStatus.BAD_GATEWAY;
        };
        return ResponseEntity.status(status)
                .body(error(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ProApiError> invalidRequest(
            IllegalArgumentException exception) {
        return ResponseEntity.badRequest()
                .body(error("invalid_request", "The Pro request is invalid."));
    }

    private static HttpStatus controlPlaneStatus(String code) {
        if (code != null && code.contains("rate")) {
            return HttpStatus.TOO_MANY_REQUESTS;
        }
        if (List.of(
                        "invalid_code",
                        "activation_code_invalid",
                        "activation_code_expired")
                .contains(code)) {
            return HttpStatus.BAD_REQUEST;
        }
        if (code != null
                && (code.contains("used")
                        || code.contains("capacity")
                        || code.contains("conflict"))) {
            return HttpStatus.CONFLICT;
        }
        return HttpStatus.BAD_GATEWAY;
    }

    private static ProApiError error(String code, String message) {
        return new ProApiError(code, message, Instant.now());
    }

    public record ProApiError(
            String code,
            String message,
            Instant occurredAt) {
    }
}
