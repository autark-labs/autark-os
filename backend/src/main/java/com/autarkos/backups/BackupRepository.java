package com.autarkos.backups;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BackupRepository extends JpaRepository<RestorePointEntity, Long> {

    long countByAppId(String appId);

    @Query(value = "select * from app_backups order by created_at desc, id desc limit :limit", nativeQuery = true)
    List<RestorePointEntity> recent(@Param("limit") int limit);

    @Query(value = "select * from app_backups where app_id = :appId order by created_at desc, id desc limit :limit", nativeQuery = true)
    List<RestorePointEntity> forApp(@Param("appId") String appId, @Param("limit") int limit);
}
