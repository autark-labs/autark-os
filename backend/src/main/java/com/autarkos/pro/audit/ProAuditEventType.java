package com.autarkos.pro.audit;

public enum ProAuditEventType {
    ACTIVATION_STARTED("activation_started"),
    DEVICE_REGISTRATION("device_registration"),
    ENTITLEMENT_REFRESH("entitlement_refresh"),
    ENTITLEMENT_STATE_TRANSITION("entitlement_state_transition"),
    MANIFEST_ACCEPTED("manifest_accepted"),
    MANIFEST_REJECTED("manifest_rejected"),
    REGISTRY_TOKEN_REQUESTED("registry_token_requested"),
    REGISTRY_TOKEN_ISSUED("registry_token_issued"),
    REGISTRY_TOKEN_FAILED("registry_token_failed"),
    SIGNATURE_VERIFIED("signature_verified"),
    SIGNATURE_REJECTED("signature_rejected"),
    PULL_STARTED("pull_started"),
    PULL_COMPLETED("pull_completed"),
    PULL_FAILED("pull_failed"),
    CANDIDATE_START("candidate_start"),
    HEALTH_RESULT("health_result"),
    CUTOVER("cutover"),
    ROLLBACK("rollback"),
    REMOVAL("removal"),
    RETAINED_USE("retained_use"),
    MODULE_STATE_TRANSITION("module_state_transition");

    private final String wireValue;

    ProAuditEventType(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
