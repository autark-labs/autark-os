package com.autarkos.pro.entitlement;

import org.springframework.data.jpa.repository.JpaRepository;

public interface JpaProEntitlementStore
        extends JpaRepository<ProEntitlementEntity, Integer> {
}
