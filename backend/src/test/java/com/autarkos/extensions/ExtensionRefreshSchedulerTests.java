package com.autarkos.extensions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.activity.SuccessfulMutationEvent;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.pro.agent.ProAgentClientException;

class ExtensionRefreshSchedulerTests {

    private static final Instant START =
            Instant.parse("2026-07-26T20:00:00Z");

    @Test
    void rapidMutationBurstProducesOneTrailingDebouncedRun() {
        Fixture fixture = fixture();

        fixture.scheduler.mutationSucceeded(
                new SuccessfulMutationEvent("applications", "started"));
        fixture.clock.advance(Duration.ofSeconds(4));
        fixture.scheduler.mutationSucceeded(
                new SuccessfulMutationEvent("settings", "updated"));
        fixture.clock.advance(Duration.ofSeconds(9));
        fixture.scheduler.tick();
        verify(fixture.extensions, never()).refresh(any());

        fixture.clock.advance(Duration.ofSeconds(1));
        fixture.scheduler.tick();
        fixture.scheduler.tick();

        verify(fixture.extensions, times(1)).refresh("autark-pro");
        assertThat(fixture.scheduler.status().latestAnalysisAt())
                .isEqualTo(fixture.clock.instant());
    }

    @Test
    void conflictLaneDefersWithoutRunningPrivateAnalysis() {
        Fixture fixture = fixture();
        when(fixture.recovery.activeOperation()).thenReturn(Optional.of(
                RecoveryOperationCoordinator.Operation.RESTORE));
        fixture.scheduler.requestRefresh("successful_mutation");
        fixture.clock.advance(Duration.ofSeconds(10));
        fixture.scheduler.tick();

        verify(fixture.extensions, never()).refresh(any());
        assertThat(fixture.scheduler.status().reasonCode())
                .isEqualTo("operation_in_progress");

        when(fixture.recovery.activeOperation()).thenReturn(Optional.empty());
        fixture.clock.advance(Duration.ofSeconds(10));
        fixture.scheduler.tick();
        verify(fixture.extensions).refresh("autark-pro");
    }

    @Test
    void unavailableAgentIsolatedFromMutationAndFailureNoticesAreBounded() {
        Fixture fixture = fixture();
        doThrow(new ProAgentClientException(
                "agent_unavailable",
                "unavailable"))
                .when(fixture.extensions)
                .refresh("autark-pro");

        fixture.scheduler.mutationSucceeded(
                new SuccessfulMutationEvent("applications", "updated"));
        fixture.clock.advance(Duration.ofSeconds(10));
        fixture.scheduler.tick();
        fixture.clock.advance(Duration.ofMinutes(15));
        fixture.scheduler.tick();

        verify(fixture.activity, times(1)).warning(
                "extension",
                "refresh_failed",
                "Private extension refresh needs attention",
                "Autark-OS will retry the private extension quietly.",
                null);
        assertThat(fixture.scheduler.status().state()).isEqualTo("error");
    }

    @Test
    void absentExtensionRemainsQuietForCommunityEdition() {
        Fixture fixture = fixture();
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND))
                .when(fixture.extensions)
                .refresh("autark-pro");
        fixture.scheduler.requestRefresh("successful_mutation");
        fixture.clock.advance(Duration.ofSeconds(10));

        fixture.scheduler.tick();

        verify(fixture.activity, never()).warning(
                any(), any(), any(), any(), any());
        assertThat(fixture.scheduler.status().state()).isEqualTo("idle");
        assertThat(fixture.scheduler.status().reasonCode())
                .isEqualTo("extension_unavailable");
    }

    @Test
    void activationRequestsAnAnalysisWithoutRunningOnPublisherThread() {
        Fixture fixture = fixture();
        fixture.scheduler.extensionActivated(
                new ExtensionRefreshRequested("extension_activated"));
        verify(fixture.extensions, never()).refresh(any());

        fixture.clock.advance(Duration.ofSeconds(10));
        fixture.scheduler.tick();
        verify(fixture.extensions).refresh("autark-pro");
    }

    @Test
    void oneAnalysisRunsAtATime() throws Exception {
        Fixture fixture = fixture();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(fixture.extensions.refresh("autark-pro")).thenAnswer(ignored -> {
            entered.countDown();
            if (!release.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("test release timed out");
            }
            return new ExtensionRefreshResult(
                    "1",
                    fixture.clock.instant(),
                    "compatible",
                    0,
                    "none",
                    null);
        });
        fixture.scheduler.requestRefresh("successful_mutation");
        fixture.clock.advance(Duration.ofSeconds(10));

        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(fixture.scheduler::tick);
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            fixture.scheduler.tick();
            release.countDown();
            first.get(2, TimeUnit.SECONDS);
        }

        verify(fixture.extensions, times(1)).refresh("autark-pro");
    }

    private static Fixture fixture() {
        ExtensionHostService extensions =
                mock(ExtensionHostService.class);
        RecoveryOperationCoordinator recovery =
                mock(RecoveryOperationCoordinator.class);
        ActivityLogService activity = mock(ActivityLogService.class);
        MutableClock clock = new MutableClock(START);
        when(recovery.activeOperation()).thenReturn(Optional.empty());
        when(extensions.refresh("autark-pro")).thenAnswer(ignored ->
                new ExtensionRefreshResult(
                        "1",
                        clock.instant(),
                        "compatible",
                        0,
                        "none",
                        null));
        ExtensionRefreshScheduler scheduler =
                new ExtensionRefreshScheduler(
                        extensions,
                        recovery,
                        activity,
                        clock,
                        true,
                        Duration.ofMinutes(15),
                        Duration.ofSeconds(10),
                        Duration.ofHours(1));
        return new Fixture(
                extensions,
                recovery,
                activity,
                clock,
                scheduler);
    }

    private record Fixture(
            ExtensionHostService extensions,
            RecoveryOperationCoordinator recovery,
            ActivityLogService activity,
            MutableClock clock,
            ExtensionRefreshScheduler scheduler) {
    }

    private static final class MutableClock extends Clock {

        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
