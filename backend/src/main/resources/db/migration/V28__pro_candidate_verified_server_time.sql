alter table pro_module_state
add column candidate_verified_server_time text check (
    candidate_verified_server_time is null
    or (
        length(candidate_verified_server_time) between 20 and 35
        and candidate_verified_server_time glob '????-??-??T??:??:??*Z'
    )
);

-- Candidates accepted before V28 did not retain the trusted control-plane
-- timestamp used to validate them. They cannot be re-authorized safely after a
-- restart, so discard only that pending authority and retain its sequence floor.
update pro_module_state
set state = case
        when active_digest is null then 'NOT_INSTALLED'
        when health = 'degraded' then 'DEGRADED'
        else 'ACTIVE'
    end,
    operation = null,
    candidate_digest = null,
    candidate_version = null,
    candidate_agent_api_range = null,
    candidate_manifest_sequence = null,
    candidate_manifest_fingerprint = null,
    candidate_envelope_payload = null,
    candidate_envelope_protected = null,
    candidate_envelope_signature = null,
    candidate_verified_server_time = null,
    health = case
        when active_digest is null then 'not-checked'
        when health = 'degraded' then 'degraded'
        else 'healthy'
    end,
    last_health_result = 'candidate_authority_migrated',
    last_error_code = null,
    last_error_message = null
where candidate_digest is not null;

create trigger pro_module_candidate_time_insert
before insert on pro_module_state
for each row
when not (
    (new.candidate_digest is null
        and new.candidate_verified_server_time is null)
    or
    (new.candidate_digest is not null
        and new.candidate_verified_server_time is not null)
)
begin
    select raise(abort, 'invalid Pro candidate authority');
end;

create trigger pro_module_candidate_time_update
before update on pro_module_state
for each row
when not (
    (new.candidate_digest is null
        and new.candidate_verified_server_time is null)
    or
    (new.candidate_digest is not null
        and new.candidate_verified_server_time is not null)
)
begin
    select raise(abort, 'invalid Pro candidate authority');
end;
