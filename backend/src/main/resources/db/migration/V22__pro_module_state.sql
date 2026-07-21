create table if not exists pro_module_state(
    singleton_id integer primary key check (singleton_id = 1),
    state text not null check (
        state in (
            'NOT_INSTALLED',
            'RELEASE_AVAILABLE',
            'DOWNLOADING',
            'VERIFYING',
            'STARTING_CANDIDATE',
            'HEALTH_CHECKING',
            'ACTIVE',
            'DEGRADED',
            'ROLLING_BACK',
            'RETAINED_USE',
            'UPDATE_INELIGIBLE',
            'REMOVING',
            'ERROR'
        )
    ),
    operation text check (
        operation is null
        or operation in ('check', 'install', 'update', 'rollback', 'remove', 'recovery')
    ),
    job_id text check (
        job_id is null
        or (job_id glob 'job_*' and length(job_id) = 36)
    ),
    component text,
    component_version text,
    agent_api_range text,
    active_digest text check (
        active_digest is null
        or (active_digest glob 'sha256:*' and length(active_digest) = 71)
    ),
    active_manifest_fingerprint text check (
        active_manifest_fingerprint is null
        or (
            active_manifest_fingerprint glob 'sha256:*'
            and length(active_manifest_fingerprint) = 71
        )
    ),
    previous_digest text check (
        previous_digest is null
        or (previous_digest glob 'sha256:*' and length(previous_digest) = 71)
    ),
    candidate_digest text check (
        candidate_digest is null
        or (candidate_digest glob 'sha256:*' and length(candidate_digest) = 71)
    ),
    candidate_version text,
    candidate_agent_api_range text,
    candidate_manifest_sequence integer check (
        candidate_manifest_sequence is null
        or candidate_manifest_sequence > 0
    ),
    candidate_manifest_fingerprint text check (
        candidate_manifest_fingerprint is null
        or (
            candidate_manifest_fingerprint glob 'sha256:*'
            and length(candidate_manifest_fingerprint) = 71
        )
    ),
    candidate_envelope_payload text,
    candidate_envelope_protected text,
    candidate_envelope_signature text,
    accepted_manifest_sequence integer check (
        accepted_manifest_sequence is null
        or accepted_manifest_sequence > 0
    ),
    health text not null check (
        health in ('not-checked', 'healthy', 'degraded', 'failed')
    ),
    last_health_result text check (
        last_health_result is null
        or length(last_health_result) between 1 and 128
    ),
    last_successful_transition_at text,
    last_error_code text check (
        last_error_code is null
        or (
            length(last_error_code) between 2 and 64
            and last_error_code not glob '*[^a-z0-9_]*'
        )
    ),
    last_error_message text check (
        last_error_message is null
        or (
            length(last_error_message) between 1 and 256
            and lower(last_error_message) not like '%authorization%'
            and lower(last_error_message) not like '%bearer%'
            and lower(last_error_message) not like '%credential%'
            and lower(last_error_message) not like '%private key%'
            and lower(last_error_message) not like '%secret%'
            and lower(last_error_message) not like '%token%'
        )
    ),
    revision integer not null default 0 check (revision >= 0),
    updated_at text not null,
    check (
        (
            candidate_digest is null
            and candidate_version is null
            and candidate_agent_api_range is null
            and candidate_manifest_sequence is null
            and candidate_manifest_fingerprint is null
            and candidate_envelope_payload is null
            and candidate_envelope_protected is null
            and candidate_envelope_signature is null
        )
        or
        (
            candidate_digest is not null
            and candidate_version is not null
            and candidate_agent_api_range is not null
            and candidate_manifest_sequence is not null
            and candidate_manifest_fingerprint is not null
            and candidate_envelope_payload is not null
            and candidate_envelope_protected is not null
            and candidate_envelope_signature is not null
        )
    )
);

insert into pro_module_state(
    singleton_id,
    state,
    health,
    updated_at
) values (
    1,
    'NOT_INSTALLED',
    'not-checked',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
on conflict(singleton_id) do nothing;
