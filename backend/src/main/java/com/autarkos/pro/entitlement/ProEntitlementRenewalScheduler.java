package com.autarkos.pro.entitlement;

import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ProEntitlementRenewalScheduler {

    private final ProEntitlementService service;
    private final boolean enabled;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public ProEntitlementRenewalScheduler(
            ProEntitlementService service,
            @Value("${autark.pro.entitlement.scheduler-enabled:true}")
                    boolean enabled) {
        this.service = service;
        this.enabled = enabled;
    }

    @Scheduled(
            initialDelayString =
                    "${autark.pro.entitlement.scheduler-initial-delay-ms:30000}",
            fixedDelayString =
                    "${autark.pro.entitlement.scheduler-interval-ms:60000}")
    public void renewIfDue() {
        if (!enabled || !running.compareAndSet(false, true)) {
            return;
        }
        try {
            service.refreshIfDue();
        } finally {
            running.set(false);
        }
    }
}
