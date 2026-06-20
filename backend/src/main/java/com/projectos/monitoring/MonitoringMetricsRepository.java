package com.projectos.monitoring;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import com.projectos.database.DatabaseBackedRepository;
import com.projectos.database.ProjectOsDatabase;
import com.projectos.marketplace.install.InstallationException;
import com.projectos.marketplace.runtime.RuntimeLayout;

@Repository
public class MonitoringMetricsRepository extends DatabaseBackedRepository {

    @Autowired
    public MonitoringMetricsRepository(ProjectOsDatabase database) {
        super(database);
    }

    public MonitoringMetricsRepository(RuntimeLayout runtimeLayout) {
        this(new ProjectOsDatabase(runtimeLayout));
    }

    public void recordHost(HostMetricSample sample) {
        migrate();
        String sql = """
                insert into host_metric_samples(system_cpu_percent, process_cpu_percent, used_memory_percent, runtime_used_percent, total_memory_bytes, free_memory_bytes, runtime_total_bytes, runtime_usable_bytes, sampled_at)
                values(?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setDouble(1, sample.systemCpuPercent());
            statement.setDouble(2, sample.processCpuPercent());
            statement.setDouble(3, sample.usedMemoryPercent());
            statement.setDouble(4, sample.runtimeUsedPercent());
            statement.setLong(5, sample.totalMemoryBytes());
            statement.setLong(6, sample.freeMemoryBytes());
            statement.setLong(7, sample.runtimeTotalBytes());
            statement.setLong(8, sample.runtimeUsableBytes());
            statement.setString(9, sample.sampledAt().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record host metric sample.", exception);
        }
    }

    public void recordApp(AppMetricSample sample) {
        migrate();
        String sql = """
                insert into app_metric_samples(app_id, cpu_percent, memory_percent, memory_usage, sampled_at)
                values(?, ?, ?, ?, ?)
                """;
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, sample.appId());
            statement.setDouble(2, sample.cpuPercent());
            statement.setDouble(3, sample.memoryPercent());
            statement.setString(4, sample.memoryUsage());
            statement.setString(5, sample.sampledAt().toString());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new InstallationException("Unable to record app metric sample.", exception);
        }
    }

    public List<HostMetricSample> hostSamplesSince(Instant since) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                select * from host_metric_samples
                where sampled_at >= ?
                order by sampled_at asc
                """)) {
            statement.setString(1, since.toString());
            ResultSet resultSet = statement.executeQuery();
            List<HostMetricSample> samples = new ArrayList<>();
            while (resultSet.next()) {
                samples.add(hostSample(resultSet));
            }
            return samples;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read host metric samples.", exception);
        }
    }

    public List<AppMetricSample> appSamplesSince(Instant since) {
        migrate();
        try (Connection connection = connection(); PreparedStatement statement = connection.prepareStatement("""
                select * from app_metric_samples
                where sampled_at >= ?
                order by sampled_at asc, app_id asc
                """)) {
            statement.setString(1, since.toString());
            ResultSet resultSet = statement.executeQuery();
            List<AppMetricSample> samples = new ArrayList<>();
            while (resultSet.next()) {
                samples.add(appSample(resultSet));
            }
            return samples;
        } catch (SQLException exception) {
            throw new InstallationException("Unable to read app metric samples.", exception);
        }
    }

    public void deleteBefore(Instant cutoff) {
        migrate();
        try (Connection connection = connection()) {
            try (PreparedStatement statement = connection.prepareStatement("delete from host_metric_samples where sampled_at < ?")) {
                statement.setString(1, cutoff.toString());
                statement.executeUpdate();
            }
            try (PreparedStatement statement = connection.prepareStatement("delete from app_metric_samples where sampled_at < ?")) {
                statement.setString(1, cutoff.toString());
                statement.executeUpdate();
            }
        } catch (SQLException exception) {
            throw new InstallationException("Unable to enforce metric retention.", exception);
        }
    }

    private HostMetricSample hostSample(ResultSet resultSet) throws SQLException {
        return new HostMetricSample(
                resultSet.getDouble("system_cpu_percent"),
                resultSet.getDouble("process_cpu_percent"),
                resultSet.getDouble("used_memory_percent"),
                resultSet.getDouble("runtime_used_percent"),
                resultSet.getLong("total_memory_bytes"),
                resultSet.getLong("free_memory_bytes"),
                resultSet.getLong("runtime_total_bytes"),
                resultSet.getLong("runtime_usable_bytes"),
                Instant.parse(resultSet.getString("sampled_at")));
    }

    private AppMetricSample appSample(ResultSet resultSet) throws SQLException {
        return new AppMetricSample(
                resultSet.getString("app_id"),
                resultSet.getDouble("cpu_percent"),
                resultSet.getDouble("memory_percent"),
                resultSet.getString("memory_usage"),
                Instant.parse(resultSet.getString("sampled_at")));
    }

}
