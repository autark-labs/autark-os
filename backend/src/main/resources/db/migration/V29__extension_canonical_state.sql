alter table extension_state
    add column state_schema_version integer not null default 1
    check(state_schema_version between 1 and 2147483647);

create index idx_extension_state_digest_updated
    on extension_state(extension_id, component_digest, updated_at desc);
