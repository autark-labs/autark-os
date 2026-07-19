package com.autarkos.jobs;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AutarkOsJobRepository extends JpaRepository<AutarkOsJobEntity, String> {

    @Query(value = """
            select * from autark_os_jobs
            where job_type = :type
              and coalesce(subject_id, '') = coalesce(:subjectId, '')
              and status in ('queued', 'running')
            order by created_at asc
            limit 1
            """, nativeQuery = true)
    Optional<AutarkOsJobEntity> activeFor(@Param("type") String type, @Param("subjectId") String subjectId);

    @Query(value = "select * from autark_os_jobs order by updated_at desc, created_at desc limit :limit", nativeQuery = true)
    List<AutarkOsJobEntity> recent(@Param("limit") int limit);

    @Query(value = """
            select * from autark_os_jobs
            where status in ('queued', 'running')
            order by created_at asc
            """, nativeQuery = true)
    List<AutarkOsJobEntity> activeJobs();

    @Modifying
    @Transactional
    @Query(value = "delete from autark_os_jobs where status in ('succeeded', 'cancelled', 'canceled') and updated_at < :cutoff", nativeQuery = true)
    int deleteCompletedBefore(@Param("cutoff") String cutoff);

    @Modifying
    @Transactional
    @Query(value = "delete from autark_os_jobs where status = 'failed' and updated_at < :cutoff", nativeQuery = true)
    int deleteFailedBefore(@Param("cutoff") String cutoff);
}
