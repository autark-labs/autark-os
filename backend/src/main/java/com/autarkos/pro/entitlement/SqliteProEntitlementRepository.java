package com.autarkos.pro.entitlement;

import java.util.Optional;

import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class SqliteProEntitlementRepository implements ProEntitlementRepository {

    private final JpaProEntitlementStore store;

    public SqliteProEntitlementRepository(JpaProEntitlementStore store) {
        this.store = store;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ProEntitlementCache> load() {
        return store.findById(ProEntitlementEntity.SINGLETON_ID)
                .map(ProEntitlementEntity::cache);
    }

    @Override
    @Transactional
    public ProEntitlementCache save(ProEntitlementCache cache) {
        if (cache == null) {
            throw new IllegalArgumentException("Pro entitlement cache is required.");
        }
        ProEntitlementEntity entity = store.findById(ProEntitlementEntity.SINGLETON_ID)
                .orElseGet(() -> new ProEntitlementEntity(cache));
        entity.update(cache);
        return store.save(entity).cache();
    }
}
