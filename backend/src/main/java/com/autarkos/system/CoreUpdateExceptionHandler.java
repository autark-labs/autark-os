package com.autarkos.system;

import java.time.Instant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = CoreUpdateController.class)
public class CoreUpdateExceptionHandler {

    @ExceptionHandler(CoreUpdateException.class)
    public ResponseEntity<CoreUpdateApiError> handle(CoreUpdateException exception) {
        return ResponseEntity.status(exception.status()).body(new CoreUpdateApiError(
                exception.code(), exception.getMessage(), Instant.now()));
    }

    public record CoreUpdateApiError(String code, String message, Instant occurredAt) {
    }
}
