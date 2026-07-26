package com.autarkos.extensions;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.autarkos.activity.ActivityLogService;
import com.autarkos.activity.SuccessfulMutationEvent;
import com.autarkos.backups.RecoveryOperationCoordinator;
import com.autarkos.pro.agent.ProAgentClientException;

@Service
public final class ExtensionRefreshScheduler
        implements ExtensionRefreshStatusSource {

    private static final String EXTENSION_ID = "autark-pro";

    private final ExtensionHostService extensions;
    private final RecoveryOperationCoordinator recoveryOperations;
    private final ActivityLogService activity;
    private final Clock clock;
    private final boolean enabled;
    private final Duration interval;
    private final Duration debounce;
    private final Duration failureQuietPeriod;
    private final AtomicBoolean running = new AtomicBoolean();

    private Instant pendingAt;
    private Instant nextAnalysisAt;
    private Instant latestAnalysisAt;
    private Instant lastFailureNoticeAt;
    private String state;
    private String reasonCode;
    private int activeFindingCount;
    private String highestSeverity = "none";

    @Autowired
    public ExtensionRefreshScheduler(
            ExtensionHostService extensions,
            RecoveryOperationCoordinator recoveryOperations,
            ActivityLogService activity,
            @Value("${autark.extensions.refresh.enabled:true}")
                    boolean enabled,
            @Value("${autark.extensions.refresh.interval:PT15M}")
                    Duration interval,
            @Value("${autark.extensions.refresh.debounce:PT10S}")
                    Duration debounce,
            @Value("${autark.extensions.refresh.failure-quiet-period:PT1H}")
                    Duration failureQuietPeriod) {
        this(
                extensions,
                recoveryOperations,
                activity,
                Clock.systemUTC(),
                enabled,
                interval,
                debounce,
                failureQuietPeriod);
    }

    ExtensionRefreshScheduler(
            ExtensionHostService extensions,
            RecoveryOperationCoordinator recoveryOperations,
            ActivityLogService activity,
            Clock clock,
            boolean enabled,
            Duration interval,
            Duration debounce,
            Duration failureQuietPeriod) {
        this.extensions = Objects.requireNonNull(extensions);
        this.recoveryOperations = Objects.requireNonNull(
                recoveryOperations);
        this.activity = Objects.requireNonNull(activity);
        this.clock = Objects.requireNonNull(clock);
        this.enabled = enabled;
        this.interval = requirePositive(interval);
        this.debounce = requirePositive(debounce);
        this.failureQuietPeriod = requirePositive(failureQuietPeriod);
        Instant now = clock.instant();
        this.nextAnalysisAt = enabled ? now.plus(interval) : null;
        this.state = enabled ? "scheduled" : "unavailable";
        this.reasonCode = enabled ? "scheduled" : "scheduler_disabled";
    }

    @EventListener
    public synchronized void mutationSucceeded(
            SuccessfulMutationEvent ignored) {
        requestRefresh("successful_mutation");
    }

    @EventListener
    public synchronized void extensionActivated(
            ExtensionRefreshRequested request) {
        requestRefresh(request == null
                ? "extension_activated"
                : request.reason());
    }

    public synchronized void requestRefresh(String reason) {
        if (!enabled) {
            return;
        }
        Instant candidate = clock.instant().plus(debounce);
        if (pendingAt == null || candidate.isAfter(pendingAt)) {
            pendingAt = candidate;
        }
        if (!running.get()) {
            state = "scheduled";
            reasonCode = safeReason(reason);
        }
    }

    @Scheduled(
            initialDelayString =
                    "${autark.extensions.refresh.tick-initial-delay-ms:30000}",
            fixedDelayString =
                    "${autark.extensions.refresh.tick-delay-ms:5000}")
    public void tick() {
        Instant now = clock.instant();
        if (!claimDue(now)) {
            return;
        }
        try {
            if (recoveryOperations.activeOperation().isPresent()) {
                deferForConflict(now);
                return;
            }
            ExtensionRefreshResult result =
                    extensions.refresh(EXTENSION_ID);
            complete(result, now);
        } catch (ProAgentClientException exception) {
            fail(now, "agent_unavailable");
        } catch (ResponseStatusException exception) {
            if (exception.getStatusCode().value() ==
                    HttpStatus.NOT_FOUND.value()) {
                unavailable(now);
            } else {
                fail(now, "refresh_failed");
            }
        } catch (RuntimeException exception) {
            fail(now, "refresh_failed");
        } finally {
            running.set(false);
        }
    }

    @Override
    public synchronized Status status() {
        return new Status(
                state,
                latestAnalysisAt,
                nextAnalysisAt,
                activeFindingCount,
                highestSeverity,
                reasonCode);
    }

    private synchronized boolean claimDue(Instant now) {
        if (!enabled || running.get()) {
            return false;
        }
        boolean cadenceDue = nextAnalysisAt != null &&
                !nextAnalysisAt.isAfter(now);
        boolean requested = pendingAt != null &&
                !pendingAt.isAfter(now);
        if (!cadenceDue && !requested) {
            return false;
        }
        if (!running.compareAndSet(false, true)) {
            return false;
        }
        pendingAt = null;
        state = "running";
        reasonCode = "analysis_running";
        return true;
    }

    private synchronized void deferForConflict(Instant now) {
        pendingAt = now.plus(debounce);
        state = "scheduled";
        reasonCode = "operation_in_progress";
    }

    private synchronized void complete(
            ExtensionRefreshResult result,
            Instant now) {
        latestAnalysisAt = result.completedAt();
        nextAnalysisAt = now.plus(interval);
        activeFindingCount = result.activeFindingCount();
        highestSeverity = result.highestSeverity();
        state = "scheduled";
        reasonCode = result.activeFindingCount() > 0
                ? "findings_available"
                : "analysis_healthy";
    }

    private synchronized void fail(Instant now, String reason) {
        nextAnalysisAt = now.plus(interval);
        state = "error";
        reasonCode = reason;
        if (lastFailureNoticeAt == null ||
                !lastFailureNoticeAt.plus(failureQuietPeriod).isAfter(now)) {
            activity.warning(
                    "extension",
                    "refresh_failed",
                    "Private extension refresh needs attention",
                    "Autark-OS will retry the private extension quietly.",
                    null);
            lastFailureNoticeAt = now;
        }
    }

    private synchronized void unavailable(Instant now) {
        nextAnalysisAt = now.plus(interval);
        latestAnalysisAt = null;
        activeFindingCount = 0;
        highestSeverity = "none";
        state = "idle";
        reasonCode = "extension_unavailable";
    }

    private static Duration requirePositive(Duration value) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(
                    "Extension refresh duration must be positive.");
        }
        return value;
    }

    private static String safeReason(String value) {
        return value != null &&
                value.matches("^[a-z][a-z0-9_]{0,63}$")
                        ? value
                        : "requested";
    }
}
