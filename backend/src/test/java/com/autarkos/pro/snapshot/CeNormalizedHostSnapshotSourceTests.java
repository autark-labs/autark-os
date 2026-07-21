package com.autarkos.pro.snapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import com.autarkos.access.AccessStatusService;
import com.autarkos.activity.ActivityLogService;
import com.autarkos.apps.ApplicationStateService;
import com.autarkos.backups.BackupService;
import com.autarkos.jobs.AutarkOsJobService;
import com.autarkos.monitoring.MonitoringMetricsService;
import com.autarkos.system.ProjectVersionService;
import com.autarkos.system.StorageService;
import com.autarkos.system.SystemMetrics;
import com.autarkos.system.SystemMetricsService;
import com.autarkos.system.SystemSetupService;

class CeNormalizedHostSnapshotSourceTests {

    @Test
    void readsCurrentMetricsWithoutRecordingAHistorySample() {
        SystemMetricsService metrics =
                mock(SystemMetricsService.class);
        MonitoringMetricsService monitoring =
                mock(MonitoringMetricsService.class);
        SystemMetrics expected = mock(SystemMetrics.class);
        when(metrics.metrics()).thenReturn(expected);
        CeNormalizedHostSnapshotSource source =
                new CeNormalizedHostSnapshotSource(
                        mock(ProjectVersionService.class),
                        mock(SystemSetupService.class),
                        mock(ApplicationStateService.class),
                        mock(AccessStatusService.class),
                        mock(BackupService.class),
                        mock(StorageService.class),
                        metrics,
                        monitoring,
                        mock(AutarkOsJobService.class),
                        mock(ActivityLogService.class));

        assertThat(source.metrics()).isSameAs(expected);
        verifyNoInteractions(monitoring);
    }
}
