package com.autarkos.pro.entitlement;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Component;

import com.autarkos.pro.identity.DeviceIdentity;
import com.autarkos.pro.model.ProContractPolicy;
import com.autarkos.pro.model.ProEntitlementState;
import com.autarkos.pro.model.ProEntitlementStatus;

@Component
public final class ProEntitlementStateReducer {

    public ProEntitlementStatus reduce(
            GrantVerifier.VerifiedGrant grant,
            ServiceLeaseVerifier.VerifiedLease lease,
            DeviceIdentity identity,
            Instant localNow,
            Instant lastVerifiedServerTime,
            Duration onlineGrace) {
        return ProContractPolicy.evaluate(
                grant == null ? null : grant.grant(),
                grant != null,
                false,
                lease == null ? null : lease.lease(),
                lease != null,
                identity.deviceId(),
                identity.publicKeyFingerprint(),
                localNow,
                lastVerifiedServerTime,
                onlineGrace,
                grant == null ? null : grant.fingerprint());
    }

    public ProEntitlementStatus invalidGrant(Instant lastVerifiedServerTime) {
        return status(
                ProEntitlementState.INVALID,
                lastVerifiedServerTime,
                false,
                false,
                false,
                "invalid_signature");
    }

    public ProEntitlementStatus invalidLease(
            GrantVerifier.VerifiedGrant grant,
            DeviceIdentity identity,
            Instant localNow,
            Instant lastVerifiedServerTime,
            Duration onlineGrace) {
        ProEntitlementStatus reduced = reduce(
                grant,
                null,
                identity,
                localNow,
                lastVerifiedServerTime,
                onlineGrace);
        if (reduced.state() == ProEntitlementState.RETAINED_USE) {
            return reduced;
        }
        return new ProEntitlementStatus(
                reduced.schemaVersion(),
                ProEntitlementState.SUSPENDED_ONLINE,
                reduced.plan(),
                reduced.features(),
                reduced.updatesThrough(),
                null,
                reduced.lastVerifiedServerTime(),
                reduced.localUseAllowed(),
                false,
                false,
                reduced.grantFingerprint(),
                "invalid_signature");
    }

    public ProEntitlementStatus internalError(Instant lastVerifiedServerTime) {
        return status(
                ProEntitlementState.ERROR,
                lastVerifiedServerTime,
                false,
                false,
                false,
                "internal_error");
    }

    private static ProEntitlementStatus status(
            ProEntitlementState state,
            Instant lastVerifiedServerTime,
            boolean localUseAllowed,
            boolean updatesAllowed,
            boolean hostedServicesAllowed,
            String reasonCode) {
        return new ProEntitlementStatus(
                ProContractPolicy.SCHEMA_VERSION,
                state,
                null,
                List.of(),
                null,
                null,
                lastVerifiedServerTime,
                localUseAllowed,
                updatesAllowed,
                hostedServicesAllowed,
                null,
                reasonCode);
    }
}
