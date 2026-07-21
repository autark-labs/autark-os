package com.autarkos.pro.entitlement;

import java.util.Optional;

public interface ProEntitlementRepository {

    Optional<ProEntitlementCache> load();

    ProEntitlementCache save(ProEntitlementCache cache);
}
