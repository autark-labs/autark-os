package com.autarkos.system;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import com.autarkos.activity.ActivityLogRepository;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.jobs.AutarkOsJobRepository;

class OperationalRecordRetentionServiceTests {

    @Test
    void prunesOnlyTerminalHistoryUsingSeparateRoutineAndAttentionWindows() {
        ActivityLogRepository activities = mock(ActivityLogRepository.class);
        AutarkOsJobRepository jobs = mock(AutarkOsJobRepository.class);
        when(activities.deleteRoutineBefore(anyString())).thenReturn(4);
        when(activities.deleteAttentionBefore(anyString())).thenReturn(1);
        when(jobs.deleteCompletedBefore(anyString())).thenReturn(3);
        when(jobs.deleteFailedBefore(anyString())).thenReturn(2);
        OperationalRecordRetentionService service = new OperationalRecordRetentionService(
                activities, jobs, mock(ActivityLogService.class), 30, 180);

        OperationalRecordRetentionService.RetentionOutcome outcome = service.pruneNow();

        assertThat(outcome.status()).isEqualTo("completed");
        assertThat(outcome.removedRecords()).isEqualTo(10);
        verify(activities).deleteRoutineBefore(anyString());
        verify(activities).deleteAttentionBefore(anyString());
        verify(jobs).deleteCompletedBefore(anyString());
        verify(jobs).deleteFailedBefore(anyString());
    }
}
