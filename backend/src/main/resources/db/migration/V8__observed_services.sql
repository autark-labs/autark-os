create table if not exists observed_services (
    id text primary key,
    source text not null,
    fingerprint text not null,
    display_name text not null,
    url text,
    category text not null default 'External',
    access_scope text not null default 'LAN',
    catalog_app_id text,
    catalog_match_confidence text not null default 'unknown',
    ownership_state text not null,
    user_visibility text not null default 'observed',
    runtime_state text not null default 'unknown',
    health_check_enabled boolean not null default false,
    autark_os_instance_id text,
    first_seen_at text not null,
    last_seen_at text not null,
    pinned_at text,
    ignored_at text,
    metadata_json text not null default '{}',
    unique(source, fingerprint)
);

create index if not exists idx_observed_services_catalog_app_id on observed_services(catalog_app_id);
create index if not exists idx_observed_services_user_visibility on observed_services(user_visibility);
create index if not exists idx_observed_services_ownership_state on observed_services(ownership_state);
