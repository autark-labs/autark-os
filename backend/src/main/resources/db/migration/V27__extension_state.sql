drop table if exists pro_guardian_findings;
drop table if exists pro_guardian_analysis_runs;

create table extension_state(
    extension_id text not null,
    component_digest text not null,
    scope text not null,
    opaque_state text not null,
    updated_at text not null,
    primary key(extension_id, component_digest, scope),
    check(length(extension_id) between 2 and 128),
    check(component_digest glob 'sha256:*'),
    check(length(component_digest) = 71),
    check(length(scope) between 2 and 128),
    check(length(opaque_state) between 1 and 262144)
);

create index idx_extension_state_updated
    on extension_state(extension_id, updated_at desc);
