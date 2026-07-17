package com.autarkos.system;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.jobs.AutarkOsJobRepository;

/**
 * Keeps the appliance database small without erasing active work or recent
 * evidence that a person may still need to investigate.
 */
@Service
public class OperationalRecordRetentionService {

    private final ActivityLogRepository activityRepository;
    private final AutarkOsJobRepository jobRepository;
    private final ActivityLogService activityLogService;
    private final int routineDays;
    private final int attentionDays;
    private final AtomicBoolean pruning = new AtomicBoolean(false);

    public OperationalRecordRetentionService(
            ActivityLogRepository activityRepository,
            AutarkOsJobRepository jobRepository,
            ActivityLogService activityLogService,
            @Value("${autark-os.retention.routine-record-days:30}") int routineDays,
            @Value("${autark-os.retention.attention-record-days:180}") int attentionDays) {
        this.activityRepository = activityRepository;
        this.jobRepository = jobRepository;
        this.activityLogService = activityLogService;
        this.routineDays = Math.max(1, routineDays);
        this.attentionDays = Math.max(this.routineDays, attentionDays);
    }

    @Scheduled(
            initialDelayString = "${autark-os.retention.initial-delay-ms:90000}",
            fixedDelayString = "${autark-os.retention.interval-ms:21600000}")
    public void pruneScheduled() {
        pruneNow();
    }

    public RetentionOutcome pruneNow() {
        if (!pruning.compareAndSet(false, true)) {
            return RetentionOutcome.skipped();
        }
        try {
            Instant now = Instant.now();
            int routineActivityRemoved = activityRepository.deleteRoutineBefore(now.minus(routineDays, ChronoUnit.DAYS).toString());
            int attentionActivityRemoved = activityRepository.deleteAttentionBefore(now.minus(attentionDays, ChronoUnit.DAYS).toString());
            int completedJobsRemoved = jobRepository.deleteCompletedBefore(now.minus(routineDays, ChronoUnit.DAYS).toString());
            int failedJobsRemoved = jobRepository.deleteFailedBefore(now.minus(attentionDays, ChronoUnit.DAYS).toString());
            RetentionOutcome outcome = new RetentionOutcome(
                    "completed",
                    routineActivityRemoved,
                    attentionActivityRemoved,
                    completedJobsRemoved,
                    failedJobsRemoved,
                    now);
            if (outcome.removedRecords() > 0) {
                activityLogService.info(
                        "system",
                        "operational_record_retention",
                        "Cleaned up older operational records",
                        "Autark-OS removed " + outcome.removedRecords() + " routine record(s). Recent warnings, failures, and all active jobs were kept.");
            }
            return outcome;
        } finally {
            pruning.set(false);
        }
    }

    public record RetentionOutcome(
            String status,
            int routineActivityRemoved,
            int attentionActivityRemoved,
            int completedJobsRemoved,
            int failedJobsRemoved,
            Instant completedAt) {
        static RetentionOutcome skipped() {
            return new RetentionOutcome("already_running", 0, 0, 0, 0, Instant.now());
        }

        public int removedRecords() {
            return routineActivityRemoved + attentionActivityRemoved + completedJobsRemoved + failedJobsRemoved;
        }
    }
}
