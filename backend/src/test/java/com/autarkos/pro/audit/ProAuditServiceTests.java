package com.autarkos.pro.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;

@SpringBootTest(properties = {
        "autark-os.guardian.enabled=false",
        "autark-os.backups.scheduler.enabled=false"
})
class ProAuditServiceTests {

    private static final Instant NOW =
            Instant.parse("2026-07-19T12:00:00Z");

    @TempDir
    static Path runtimeRoot;

    @Autowired
    ProAuditService service;

    @Autowired
    ActivityLogRepository repository;

    @Autowired
    ActivityLogService activity;

    @DynamicPropertySource
    static void runtimeProperties(
            DynamicPropertyRegistry registry) {
        registry.add(
                "autark-os.runtime-root",
                () -> runtimeRoot.toString());
    }

    @Test
    void persistsOneIdempotentRedactedStructuredEvent() {
        ProAuditEvent event = event();

        service.recordRequired(event);
        service.recordRequired(event);

        assertThat(activity.recent(
                        20,
                        null,
                        "pro",
                        null,
                        null))
                .filteredOn(log ->
                        "cutover".equals(log.action()))
                .singleElement()
                .satisfies(log -> {
                    assertThat(log.action())
                            .isEqualTo("cutover");
                    assertThat(log.details())
                            .contains(
                                    "\"digestPrefix\":\"sha256:aaaaaaaaaaaa\"",
                                    "\"correlationId\":\"job_"
                                            + "1".repeat(32)
                                            + "\"",
                                    "\"fromState\":\"HEALTH_CHECKING\"",
                                    "\"toState\":\"ACTIVE\"")
                            .doesNotContain(
                                    "a".repeat(64),
                                    "signature",
                                    "payload",
                                    "authorization");
                });
        assertThat(repository.findByEventKey(
                        "pro:cutover:module-7-cutover"))
                .isPresent();
    }

    @Test
    void persistenceFailureIsFailClosedAndMessageIsGeneric() {
        ActivityLogRepository failing =
                mock(ActivityLogRepository.class);
        when(failing.insertProAudit(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any()))
                .thenThrow(new IllegalStateException(
                        "database contains secret marker"));
        ProAuditService strict = new ProAuditService(
                failing,
                Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatThrownBy(() ->
                strict.recordRequired(event()))
                .isInstanceOf(ProAuditException.class)
                .hasMessage(
                        "A required Autark Pro audit event could not be persisted.")
                .hasMessageNotContaining("secret marker");
    }

    @Test
    void secretShapedIdentifiersAreRejectedBeforePersistence() {
        ProAuditEvent event = new ProAuditEvent(
                "aaa.bbb.ccc",
                ProAuditEventType.REGISTRY_TOKEN_REQUESTED,
                null,
                "registry",
                null,
                null,
                null,
                null,
                "started",
                null,
                null,
                null);

        assertThatThrownBy(() ->
                service.recordRequired(event))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid Autark Pro audit event.");
    }

    @Test
    void failedSignaturePersistsOnlySafeKeyFingerprintAndReason() {
        ProAuditEvent event = new ProAuditEvent(
                "release-failed-signature",
                ProAuditEventType.SIGNATURE_REJECTED,
                null,
                "release",
                null,
                null,
                null,
                null,
                "failed",
                "invalid_signature",
                "staging-release-2026-01",
                "sha256:" + "b".repeat(64));

        service.recordRequired(event);

        var stored = repository.findByEventKey(
                        "pro:signature_rejected:"
                                + "release-failed-signature")
                .orElseThrow();
        assertThat(stored.details())
                .contains(
                        "\"keyId\":\"staging-release-2026-01\"",
                        "\"fingerprintPrefix\":\"sha256:bbbbbbbbbbbb\"",
                        "\"reasonCode\":\"invalid_signature\"",
                        "\"correlationId\":\"audit-release-failed-signature\"")
                .doesNotContain(
                        "b".repeat(64),
                        "\"payload\"",
                        "\"signature\"");
    }

    @Test
    void concurrentRetriesStillAppendExactlyOneEvent()
            throws Exception {
        var executor = Executors.newFixedThreadPool(6);
        try {
            List<Future<?>> calls = new ArrayList<>();
            for (int index = 0; index < 12; index++) {
                calls.add(executor.submit(() ->
                        service.recordRequired(event())));
            }
            for (Future<?> call : calls) {
                call.get();
            }
        } finally {
            executor.shutdownNow();
        }

        assertThat(repository.findAll().stream()
                        .filter(entity ->
                                "pro:cutover:module-7-cutover"
                                        .equals(entity.eventKey())))
                .hasSize(1);
    }

    @Test
    void proAuditRowsAreExcludedFromRetentionAndRejectDeletion() {
        service.recordRequired(event());
        var stored = repository.findByEventKey(
                        "pro:cutover:module-7-cutover")
                .orElseThrow();

        assertThat(repository.deleteRoutineBefore(
                        "9999-12-31T23:59:59Z"))
                .isZero();
        assertThatThrownBy(() ->
                repository.deleteById(stored.id()))
                .isInstanceOf(RuntimeException.class)
                .hasRootCauseMessage(
                        "[SQLITE_CONSTRAINT_TRIGGER] "
                                + "A RAISE function within a trigger fired, "
                                + "causing the SQL statement to abort "
                                + "(Autark Pro audit records are append-only)");
        assertThat(repository.findByEventKey(
                        "pro:cutover:module-7-cutover"))
                .isPresent();
    }

    private static ProAuditEvent event() {
        return new ProAuditEvent(
                "module-7-cutover",
                ProAuditEventType.CUTOVER,
                "job_" + "1".repeat(32),
                "autark-pro-agent",
                "0.1.0",
                "sha256:" + "a".repeat(64),
                "HEALTH_CHECKING",
                "ACTIVE",
                "completed",
                "healthy",
                "release-test-key",
                "sha256:" + "b".repeat(64));
    }
}
