alter table pro_module_state
add column previous_component_version text;

alter table pro_module_state
add column previous_agent_api_range text;

alter table pro_module_state
add column previous_manifest_fingerprint text check (
    previous_manifest_fingerprint is null
    or (
        previous_manifest_fingerprint glob 'sha256:*'
        and length(previous_manifest_fingerprint) = 71
    )
);

-- V22 retained only a digest for this generation, which cannot safely restore
-- its version/API/fingerprint. Discard that incomplete rollback authority once;
-- all cutovers after V24 persist the complete tuple.
update pro_module_state
set previous_digest = null
where previous_digest is not null;

drop trigger pro_module_state_semantic_insert;
drop trigger pro_module_state_semantic_update;

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
            and new.previous_component_version is null
            and new.previous_agent_api_range is null
            and new.previous_manifest_fingerprint is null
        )
        or
        (
            new.active_digest is not null
            and new.active_manifest_fingerprint is not null
            and new.component is not null
            and new.component_version is not null
            and new.agent_api_range is not null
            and (
                (
                    new.previous_digest is null
                    and new.previous_component_version is null
                    and new.previous_agent_api_range is null
                    and new.previous_manifest_fingerprint is null
                )
                or
                (
                    new.previous_digest is not null
                    and new.previous_component_version is not null
                    and new.previous_agent_api_range is not null
                    and new.previous_manifest_fingerprint is not null
                )
            )
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
                'HEALTH_CHECKING'
            )
            and new.candidate_digest is not null
        )
        or (
            new.state = 'ROLLING_BACK'
            and (
                new.candidate_digest is not null
                or (
                    new.active_digest is not null
                    and new.previous_digest is not null
                )
            )
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
            and new.previous_component_version is null
            and new.previous_agent_api_range is null
            and new.previous_manifest_fingerprint is null
        )
        or
        (
            new.active_digest is not null
            and new.active_manifest_fingerprint is not null
            and new.component is not null
            and new.component_version is not null
            and new.agent_api_range is not null
            and (
                (
                    new.previous_digest is null
                    and new.previous_component_version is null
                    and new.previous_agent_api_range is null
                    and new.previous_manifest_fingerprint is null
                )
                or
                (
                    new.previous_digest is not null
                    and new.previous_component_version is not null
                    and new.previous_agent_api_range is not null
                    and new.previous_manifest_fingerprint is not null
                )
            )
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
                'HEALTH_CHECKING'
            )
            and new.candidate_digest is not null
        )
        or (
            new.state = 'ROLLING_BACK'
            and (
                new.candidate_digest is not null
                or (
                    new.active_digest is not null
                    and new.previous_digest is not null
                )
            )
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
