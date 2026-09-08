package com.autarkos.backups;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BackupRepository extends JpaRepository<RestorePointEntity, Long> {

    @Query(value = "select * from app_backups where app_id = :appId or (backup_scope = 'full' and instr(',' || replace(included_app_ids, ' ', '') || ',', ',' || :appId || ',') > 0) order by created_at desc, id desc", nativeQuery = true)
    List<RestorePointEntity> containingApp(@Param("appId") String appId);

    long countByAppId(String appId);

    @Query(value = "select * from app_backups order by created_at desc, id desc limit :limit", nativeQuery = true)
    List<RestorePointEntity> recent(@Param("limit") int limit);

    @Query(value = "select * from app_backups where app_id = :appId order by created_at desc, id desc limit :limit", nativeQuery = true)
    List<RestorePointEntity> forApp(@Param("appId") String appId, @Param("limit") int limit);
}
