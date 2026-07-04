package com.autarkos.host;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "observed_services")
class ObservedServiceEntity {

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "source", nullable = false)
    private String source;

    @Column(name = "fingerprint", nullable = false)
    private String fingerprint;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "url")
    private String url;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "access_scope", nullable = false)
    private String accessScope;

    @Column(name = "catalog_app_id")
    private String catalogAppId;

    @Column(name = "catalog_match_confidence", nullable = false)
    private String catalogMatchConfidence;

    @Column(name = "ownership_state", nullable = false)
    private String ownershipState;

    @Column(name = "user_visibility", nullable = false)
    private String userVisibility;

    @Column(name = "runtime_state", nullable = false)
    private String runtimeState;

    @Column(name = "health_check_enabled", nullable = false)
    private boolean healthCheckEnabled;

    @Column(name = "autark_os_instance_id")
    private String autarkOsInstanceId;

    @Column(name = "first_seen_at", nullable = false)
    private String firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private String lastSeenAt;

    @Column(name = "pinned_at")
    private String pinnedAt;

    @Column(name = "ignored_at")
    private String ignoredAt;

    @Column(name = "metadata_json", nullable = false)
    private String metadataJson;

    protected ObservedServiceEntity() {
    }

    ObservedServiceEntity(ObservedService service) {
        this.id = service.id();
        this.source = service.source();
        this.fingerprint = service.fingerprint();
        this.firstSeenAt = service.firstSeenAt().toString();
        updateFrom(service);
    }

    void updateFrom(ObservedService service) {
        this.displayName = service.displayName();
        this.url = cleanToNull(service.url());
        this.category = blankDefault(service.category(), "External");
        this.accessScope = blankDefault(service.accessScope(), "LAN");
        this.catalogAppId = cleanToNull(service.catalogAppId());
        this.catalogMatchConfidence = blankDefault(service.catalogMatchConfidence(), "unknown");
        this.ownershipState = blankDefault(service.ownershipState(), "external");
        this.userVisibility = blankDefault(service.userVisibility(), "observed");
        this.runtimeState = blankDefault(service.runtimeState(), "unknown");
        this.healthCheckEnabled = service.healthCheckEnabled();
        this.autarkOsInstanceId = cleanToNull(service.autarkOsInstanceId());
        this.lastSeenAt = service.lastSeenAt().toString();
        this.pinnedAt = service.pinnedAt() == null ? null : service.pinnedAt().toString();
        this.ignoredAt = service.ignoredAt() == null ? null : service.ignoredAt().toString();
        this.metadataJson = blankDefault(service.metadataJson(), "{}");
    }

    void pin(String pinnedAt) {
        this.userVisibility = "pinned";
        this.pinnedAt = pinnedAt;
    }

    void unpin() {
        this.userVisibility = "observed";
        this.pinnedAt = null;
    }

    void updateCatalogMatch(String catalogAppId, String confidence) {
        this.catalogAppId = cleanToNull(catalogAppId);
        this.catalogMatchConfidence = confidence == null || confidence.isBlank() ? "unknown" : confidence;
    }

    void markManaged(String autarkOsInstanceId, String lastSeenAt) {
        this.ownershipState = "owned_managed";
        this.autarkOsInstanceId = cleanToNull(autarkOsInstanceId);
        this.userVisibility = "observed";
        this.ignoredAt = null;
        this.lastSeenAt = lastSeenAt;
    }

    String id() {
        return id;
    }

    String source() {
        return source;
    }

    String fingerprint() {
        return fingerprint;
    }

    String displayName() {
        return displayName;
    }

    String url() {
        return url;
    }

    String category() {
        return category;
    }

    String accessScope() {
        return accessScope;
    }

    String catalogAppId() {
        return catalogAppId;
    }

    String catalogMatchConfidence() {
        return catalogMatchConfidence;
    }

    String ownershipState() {
        return ownershipState;
    }

    String userVisibility() {
        return userVisibility;
    }

    String runtimeState() {
        return runtimeState;
    }

    boolean healthCheckEnabled() {
        return healthCheckEnabled;
    }

    String autarkOsInstanceId() {
        return autarkOsInstanceId;
    }

    String firstSeenAt() {
        return firstSeenAt;
    }

    String lastSeenAt() {
        return lastSeenAt;
    }

    String pinnedAt() {
        return pinnedAt;
    }

    String ignoredAt() {
        return ignoredAt;
    }

    String metadataJson() {
        return metadataJson;
    }

    private static String cleanToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
