package com.autarkos.pro.module;

import com.autarkos.pro.entitlement.ProStatusResponse;
import com.autarkos.pro.model.ProEntitlementStatus;

public interface ProModuleStatusProvider {

    ProStatusResponse.ModuleStatus status(ProEntitlementStatus entitlement);
}
