package com.autarkos.activity;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface ActivityLogRepository extends JpaRepository<ActivityLogEntity, Long> {

    @Query(value = "select * from activity_logs order by created_at desc, id desc limit :limit", nativeQuery = true)
    List<ActivityLogEntity> recent(@Param("limit") int limit);

    @Query(value = """
            select * from activity_logs
            where (:level is null or level = :level)
              and (:category is null or category = :category)
              and (:outcome is null or outcome = :outcome)
              and (:appId is null or app_id = :appId)
            order by created_at desc, id desc
            limit :limit
            """, nativeQuery = true)
    List<ActivityLogEntity> recentFiltered(
            @Param("limit") int limit,
            @Param("level") String level,
            @Param("category") String category,
            @Param("outcome") String outcome,
            @Param("appId") String appId);

    @Modifying
    @Transactional
    @Query(value = "delete from activity_logs where level in ('info', 'success') and created_at < :cutoff", nativeQuery = true)
    int deleteRoutineBefore(@Param("cutoff") String cutoff);

    @Modifying
    @Transactional
    @Query(value = "delete from activity_logs where level in ('warning', 'error') and created_at < :cutoff", nativeQuery = true)
    int deleteAttentionBefore(@Param("cutoff") String cutoff);
}
