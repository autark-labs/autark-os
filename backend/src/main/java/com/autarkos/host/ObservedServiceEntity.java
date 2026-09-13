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

    @Column(name = "access_scope", nullable = false)
    private String accessScope;

    @Column(name = "catalog_app_id")
    private String catalogAppId;

    @Column(name = "catalog_match_confidence", nullable = false)
    private String catalogMatchConfidence;

    @Column(name = "ownership_state", nullable = false)
    private String ownershipState;

    @Column(name = "runtime_state", nullable = false)
    private String runtimeState;

    @Column(name = "autark_os_instance_id")
    private String autarkOsInstanceId;

    @Column(name = "first_seen_at", nullable = false)
    private String firstSeenAt;

    @Column(name = "last_seen_at", nullable = false)
    private String lastSeenAt;

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
        this.accessScope = blankDefault(service.accessScope(), "LAN");
        this.catalogAppId = cleanToNull(service.catalogAppId());
        this.catalogMatchConfidence = blankDefault(service.catalogMatchConfidence(), "unknown");
        this.ownershipState = blankDefault(service.ownershipState(), "external");
        this.runtimeState = blankDefault(service.runtimeState(), "unknown");
        this.autarkOsInstanceId = cleanToNull(service.autarkOsInstanceId());
        this.lastSeenAt = service.lastSeenAt().toString();
        this.metadataJson = blankDefault(service.metadataJson(), "{}");
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

    String runtimeState() {
        return runtimeState;
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
