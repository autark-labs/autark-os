package com.autarkos.monitoring;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface HostMetricSampleRepository extends JpaRepository<HostMetricSampleEntity, Long> {

    @Query(value = """
            select * from host_metric_samples
            where sampled_at >= :since
            order by sampled_at asc
            """, nativeQuery = true)
    List<HostMetricSampleEntity> since(@Param("since") String since);

    @Modifying
    @Transactional
    @Query(value = "delete from host_metric_samples where sampled_at < :cutoff", nativeQuery = true)
    int deleteBefore(@Param("cutoff") String cutoff);
}
