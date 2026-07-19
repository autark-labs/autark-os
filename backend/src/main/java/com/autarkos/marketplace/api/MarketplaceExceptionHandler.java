package com.autarkos.marketplace.api;

import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.backups.RecoveryOperationConflictException;
import com.autarkos.marketplace.catalog.ManifestValidationException;
import com.autarkos.marketplace.install.DuplicateInstallAcknowledgementRequiredException;
import com.autarkos.marketplace.install.InstallationException;

@RestControllerAdvice
public class MarketplaceExceptionHandler {

    private final ActivityLogService activityLogService;

    public MarketplaceExceptionHandler(ActivityLogService activityLogService) {
        this.activityLogService = activityLogService;
    }

    @ExceptionHandler(ManifestValidationException.class)
    public ResponseEntity<ApiError> manifestValidation(ManifestValidationException exception) {
        activityLogService.error("marketplace", "manifest_validation_failed", "Manifest validation failed", "Application manifest validation failed.", null, exception);
        return ResponseEntity.badRequest().body(new ApiError(
                "invalid_manifest",
                "Application manifest is invalid.",
                exception.errors(),
                Instant.now()));
    }

    @ExceptionHandler(InstallationException.class)
    public ResponseEntity<ApiError> installation(InstallationException exception) {
        activityLogService.error("applications", "app_lifecycle_error", "Application action failed", exception.getMessage(), null, exception);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError(
                "app_lifecycle_error",
                exception.getMessage(),
                List.of(),
                Instant.now()));
    }

    @ExceptionHandler(RecoveryOperationConflictException.class)
    public ResponseEntity<ApiError> recoveryOperationConflict(RecoveryOperationConflictException exception) {
        activityLogService.warning(
                "backup",
                "recovery_operation_conflict",
                "Recovery operation is already running",
                exception.getMessage(),
                null);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError(
                "recovery_operation_conflict",
                exception.getMessage(),
                List.of("Wait for the current operation to finish, then try again."),
                Instant.now()));
    }

    @ExceptionHandler(DuplicateInstallAcknowledgementRequiredException.class)
    public ResponseEntity<ApiError> duplicateInstallAcknowledgementRequired(DuplicateInstallAcknowledgementRequiredException exception) {
        activityLogService.warning("applications", "duplicate_install_acknowledgement_required", "Install needs confirmation", exception.getMessage(), exception.appId());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError(
                "duplicate_install_acknowledgement_required",
                exception.getMessage(),
                List.of(
                        "Review the service Autark-OS already found before installing another copy.",
                        "To continue intentionally, retry the install with duplicateAcknowledged set to true."),
                Instant.now()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiError> illegalState(IllegalStateException exception) {
        activityLogService.error("system", "backend_error", "Backend error", exception.getMessage(), null, exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(
                "marketplace_error",
                exception.getMessage(),
                List.of(),
                Instant.now()));
    }

    public record ApiError(String code, String message, List<String> details, Instant timestamp) {
    }
}
