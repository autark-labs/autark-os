update pro_module_state
set last_successful_transition_at = updated_at
where last_successful_transition_at is null;

create trigger pro_module_state_semantic_insert
before insert on pro_module_state
for each row
when not (
    (
        (
            new.active_digest is null
            and new.active_manifest_fingerprint is null
            and new.component is null
            and new.component_version is null
            and new.agent_api_range is null
            and new.previous_digest is null
        )
        or
        (
            new.active_digest is not null
            and new.active_manifest_fingerprint is not null
            and new.component is not null
            and new.component_version is not null
            and new.agent_api_range is not null
        )
    )
    and
    (
        (
            new.state = 'NOT_INSTALLED'
            and new.active_digest is null
            and new.candidate_digest is null
        )
        or (
            new.state in (
                'RELEASE_AVAILABLE',
                'DOWNLOADING',
                'VERIFYING',
                'STARTING_CANDIDATE',
                'HEALTH_CHECKING',
                'ROLLING_BACK'
            )
            and new.candidate_digest is not null
        )
        or (
            new.state in ('ACTIVE', 'DEGRADED', 'RETAINED_USE')
            and new.active_digest is not null
            and new.candidate_digest is null
        )
        or (
            new.state = 'UPDATE_INELIGIBLE'
            and new.candidate_digest is null
        )
        or new.state in ('REMOVING', 'ERROR')
    )
)
begin
    select raise(abort, 'invalid Pro module state');
end;

create trigger pro_module_state_semantic_update
before update on pro_module_state
for each row
when not (
    (
        (
            new.active_digest is null
            and new.active_manifest_fingerprint is null
            and new.component is null
            and new.component_version is null
            and new.agent_api_range is null
            and new.previous_digest is null
        )
        or
        (
            new.active_digest is not null
            and new.active_manifest_fingerprint is not null
            and new.component is not null
            and new.component_version is not null
            and new.agent_api_range is not null
        )
    )
    and
    (
        (
            new.state = 'NOT_INSTALLED'
            and new.active_digest is null
            and new.candidate_digest is null
        )
        or (
            new.state in (
                'RELEASE_AVAILABLE',
                'DOWNLOADING',
                'VERIFYING',
                'STARTING_CANDIDATE',
                'HEALTH_CHECKING',
                'ROLLING_BACK'
            )
            and new.candidate_digest is not null
        )
        or (
            new.state in ('ACTIVE', 'DEGRADED', 'RETAINED_USE')
            and new.active_digest is not null
            and new.candidate_digest is null
        )
        or (
            new.state = 'UPDATE_INELIGIBLE'
            and new.candidate_digest is null
        )
        or new.state in ('REMOVING', 'ERROR')
    )
)
begin
    select raise(abort, 'invalid Pro module state');
end;
