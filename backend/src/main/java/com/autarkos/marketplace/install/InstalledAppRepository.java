package com.autarkos.marketplace.install;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.autarkos.marketplace.install.InstalledApps.AppEventRow;
import com.autarkos.marketplace.install.InstalledApps.AppHealthRow;
import com.autarkos.marketplace.install.InstalledApps.InstallSettingsRow;

@Repository
public interface InstalledAppRepository extends JpaRepository<InstalledAppEntity, String> {

    List<InstalledAppEntity> findAllByOrderByAppNameAsc();

    default void save(InstalledApp app) {
        save(InstalledApps.entity(app, findById(app.appId()).orElse(null), Instant.now()));
    }

    default List<InstalledApp> findAllApps() {
        return findAllByOrderByAppNameAsc().stream()
                .map(InstalledApps::app)
                .toList();
    }

    default Optional<InstalledApp> findAppById(String appId) {
        return findById(appId).map(InstalledApps::app);
    }

    default void deleteApp(String appId) {
        deleteById(appId);
    }

    default void saveOwnershipMetadata(RuntimeModels.InstalledAppOwnershipMetadata metadata) {
        findById(metadata.appId()).ifPresent(entity -> {
            entity.updateOwnership(metadata);
            save(entity);
        });
    }

    default Optional<RuntimeModels.InstalledAppOwnershipMetadata> ownershipFor(String appId) {
        return findById(appId).map(InstalledApps::ownership);
    }

    @Transactional
    @Modifying
    @Query("update InstalledAppEntity app set app.status = :status where app.appId = :appId")
    void updateStatus(@Param("appId") String appId, @Param("status") String status);

    default void saveSettings(String appId, InstallModels.InstallSettings settings) {
        upsertSettings(
                appId,
                settings.accessUrl(),
                settings.privateAccessUrl(),
                settings.tailscaleEnabled() ? 1 : 0,
                InstalledApps.encodeMap(settings.storageSubfolders()),
                settings.backup().enabled() ? 1 : 0,
                settings.backup().frequency(),
                settings.backup().retention(),
                settings.desiredAccessMode(),
                settings.privateAccessRequirement(),
                settings.expectedLocalPort(),
                settings.expectedProtocol(),
                InstalledApps.encodeInstant(settings.lastAccessCheckAt()),
                InstalledApps.encodeInstant(settings.lastSuccessfulAccessAt()),
                InstalledApps.encodeInstant(settings.lastRepairAttemptAt()),
                settings.lastRepairStatus(),
                settings.autoRepairEnabled() ? 1 : 0);
    }

    @Transactional
    @Modifying
    @Query(value = """
            insert into installed_app_settings(
                app_id,
                access_url,
                private_access_url,
                tailscale_enabled,
                storage_subfolders,
                backup_enabled,
                backup_frequency,
                backup_retention,
                desired_access_mode,
                private_access_requirement,
                expected_local_port,
                expected_protocol,
                last_access_check_at,
                last_successful_access_at,
                last_repair_attempt_at,
                last_repair_status,
                auto_repair_enabled
            )
            values(
                :appId,
                :accessUrl,
                :privateAccessUrl,
                :tailscaleEnabled,
                :storageSubfolders,
                :backupEnabled,
                :backupFrequency,
                :backupRetention,
                :desiredAccessMode,
                :privateAccessRequirement,
                :expectedLocalPort,
                :expectedProtocol,
                :lastAccessCheckAt,
                :lastSuccessfulAccessAt,
                :lastRepairAttemptAt,
                :lastRepairStatus,
                :autoRepairEnabled
            )
            on conflict(app_id) do update set
                access_url = excluded.access_url,
                private_access_url = excluded.private_access_url,
                tailscale_enabled = excluded.tailscale_enabled,
                storage_subfolders = excluded.storage_subfolders,
                backup_enabled = excluded.backup_enabled,
                backup_frequency = excluded.backup_frequency,
                backup_retention = excluded.backup_retention,
                desired_access_mode = excluded.desired_access_mode,
                private_access_requirement = excluded.private_access_requirement,
                expected_local_port = excluded.expected_local_port,
                expected_protocol = excluded.expected_protocol,
                last_access_check_at = excluded.last_access_check_at,
                last_successful_access_at = excluded.last_successful_access_at,
                last_repair_attempt_at = excluded.last_repair_attempt_at,
                last_repair_status = excluded.last_repair_status,
                auto_repair_enabled = excluded.auto_repair_enabled
            """, nativeQuery = true)
    void upsertSettings(
            @Param("appId") String appId,
            @Param("accessUrl") String accessUrl,
            @Param("privateAccessUrl") String privateAccessUrl,
            @Param("tailscaleEnabled") int tailscaleEnabled,
            @Param("storageSubfolders") String storageSubfolders,
            @Param("backupEnabled") int backupEnabled,
            @Param("backupFrequency") String backupFrequency,
            @Param("backupRetention") int backupRetention,
            @Param("desiredAccessMode") String desiredAccessMode,
            @Param("privateAccessRequirement") String privateAccessRequirement,
            @Param("expectedLocalPort") Integer expectedLocalPort,
            @Param("expectedProtocol") String expectedProtocol,
            @Param("lastAccessCheckAt") String lastAccessCheckAt,
            @Param("lastSuccessfulAccessAt") String lastSuccessfulAccessAt,
            @Param("lastRepairAttemptAt") String lastRepairAttemptAt,
            @Param("lastRepairStatus") String lastRepairStatus,
            @Param("autoRepairEnabled") int autoRepairEnabled);

    default Optional<InstallModels.InstallSettings> settingsFor(String appId) {
        return settingsRowFor(appId).map(InstalledApps::settings);
    }

    @Query(value = """
            select
                access_url as accessUrl,
                private_access_url as privateAccessUrl,
                tailscale_enabled as tailscaleEnabled,
                storage_subfolders as storageSubfolders,
                backup_enabled as backupEnabled,
                backup_frequency as backupFrequency,
                backup_retention as backupRetention,
                desired_access_mode as desiredAccessMode,
                private_access_requirement as privateAccessRequirement,
                expected_local_port as expectedLocalPort,
                expected_protocol as expectedProtocol,
                last_access_check_at as lastAccessCheckAt,
                last_successful_access_at as lastSuccessfulAccessAt,
                last_repair_attempt_at as lastRepairAttemptAt,
                last_repair_status as lastRepairStatus,
                auto_repair_enabled as autoRepairEnabled
            from installed_app_settings
            where app_id = :appId
            """, nativeQuery = true)
    Optional<InstallSettingsRow> settingsRowFor(@Param("appId") String appId);

    default void recordEvent(String appId, String type, String message) {
        insertEvent(appId, type, message, Instant.now().toString());
    }

    @Transactional
    @Modifying
    @Query(value = """
            insert into app_events(app_id, event_type, message, created_at)
            values(:appId, :eventType, :message, :createdAt)
            """, nativeQuery = true)
    void insertEvent(
            @Param("appId") String appId,
            @Param("eventType") String eventType,
            @Param("message") String message,
            @Param("createdAt") String createdAt);

    default List<AppEvent> eventsFor(String appId, int limit) {
        return eventRowsFor(appId, limit).stream()
                .map(InstalledApps::event)
                .toList();
    }

    @Query(value = """
            select
                id,
                app_id as appId,
                event_type as eventType,
                message,
                created_at as createdAt
            from app_events
            where app_id = :appId
            order by created_at desc, id desc
            limit :limit
            """, nativeQuery = true)
    List<AppEventRow> eventRowsFor(@Param("appId") String appId, @Param("limit") int limit);

    default void saveHealthSnapshot(AppHealthSnapshot snapshot) {
        upsertHealthSnapshot(
                snapshot.appId(),
                snapshot.status(),
                snapshot.message(),
                snapshot.detail(),
                snapshot.dockerStatus(),
                snapshot.localAccessStatus(),
                snapshot.privateAccessStatus(),
                snapshot.startupGrace() ? 1 : 0,
                snapshot.checkedAt().toString());
    }

    @Transactional
    @Modifying
    @Query(value = """
            insert into app_health(
                app_id,
                status,
                message,
                detail,
                docker_status,
                local_access_status,
                private_access_status,
                startup_grace,
                checked_at
            )
            values(
                :appId,
                :status,
                :message,
                :detail,
                :dockerStatus,
                :localAccessStatus,
                :privateAccessStatus,
                :startupGrace,
                :checkedAt
            )
            on conflict(app_id) do update set
                status = excluded.status,
                message = excluded.message,
                detail = excluded.detail,
                docker_status = excluded.docker_status,
                local_access_status = excluded.local_access_status,
                private_access_status = excluded.private_access_status,
                startup_grace = excluded.startup_grace,
                checked_at = excluded.checked_at
            """, nativeQuery = true)
    void upsertHealthSnapshot(
            @Param("appId") String appId,
            @Param("status") String status,
            @Param("message") String message,
            @Param("detail") String detail,
            @Param("dockerStatus") String dockerStatus,
            @Param("localAccessStatus") String localAccessStatus,
            @Param("privateAccessStatus") String privateAccessStatus,
            @Param("startupGrace") int startupGrace,
            @Param("checkedAt") String checkedAt);

    default Optional<AppHealthSnapshot> healthFor(String appId) {
        return healthRowFor(appId).map(InstalledApps::healthSnapshot);
    }

    @Query(value = """
            select
                app_id as appId,
                status,
                message,
                detail,
                docker_status as dockerStatus,
                local_access_status as localAccessStatus,
                private_access_status as privateAccessStatus,
                startup_grace as startupGrace,
                checked_at as checkedAt
            from app_health
            where app_id = :appId
            """, nativeQuery = true)
    Optional<AppHealthRow> healthRowFor(@Param("appId") String appId);

    default Map<String, AppHealthSnapshot> healthSnapshots() {
        return healthRows().stream()
                .map(InstalledApps::healthSnapshot)
                .sorted(Comparator.comparing(AppHealthSnapshot::appId))
                .collect(LinkedHashMap::new, (snapshots, snapshot) -> snapshots.put(snapshot.appId(), snapshot), LinkedHashMap::putAll);
    }

    @Query(value = """
            select
                app_id as appId,
                status,
                message,
                detail,
                docker_status as dockerStatus,
                local_access_status as localAccessStatus,
                private_access_status as privateAccessStatus,
                startup_grace as startupGrace,
                checked_at as checkedAt
            from app_health
            """, nativeQuery = true)
    List<AppHealthRow> healthRows();
}
