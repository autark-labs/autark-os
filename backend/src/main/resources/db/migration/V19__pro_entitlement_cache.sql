create table if not exists pro_entitlement_cache(
    cache_id integer primary key check (cache_id = 1),
    schema_version text not null check (schema_version = '1'),
    registration_id text,
    durable_grant_payload text,
    durable_grant_protected text,
    durable_grant_signature text,
    durable_grant_fingerprint text,
    durable_grant_key_id text,
    durable_grant_issued_at text,
    service_lease_payload text,
    service_lease_protected text,
    service_lease_signature text,
    service_lease_fingerprint text,
    service_lease_key_id text,
    service_lease_issued_at text,
    last_verified_server_time text,
    last_refresh_attempt_at text,
    last_refresh_success_at text,
    last_failure_category text,
    consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
    next_refresh_at text,
    deactivated_at text,
    created_at text not null,
    updated_at text not null,
    check (
        (durable_grant_payload is null
            and durable_grant_protected is null
            and durable_grant_signature is null
            and durable_grant_fingerprint is null
            and durable_grant_key_id is null
            and durable_grant_issued_at is null)
        or
        (durable_grant_payload is not null
            and durable_grant_protected is not null
            and durable_grant_signature is not null
            and durable_grant_fingerprint is not null
            and durable_grant_key_id is not null
            and durable_grant_issued_at is not null)
    ),
    check (
        (service_lease_payload is null
            and service_lease_protected is null
            and service_lease_signature is null
            and service_lease_fingerprint is null
            and service_lease_key_id is null
            and service_lease_issued_at is null)
        or
        (service_lease_payload is not null
            and service_lease_protected is not null
            and service_lease_signature is not null
            and service_lease_fingerprint is not null
            and service_lease_key_id is not null
            and service_lease_issued_at is not null)
    )
);
