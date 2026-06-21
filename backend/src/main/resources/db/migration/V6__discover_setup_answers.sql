create table if not exists discover_app_setup_answers(
    app_id text primary key,
    catalog_app_id text not null,
    display_name text not null,
    access_mode text not null,
    storage_mode text not null,
    backup_policy text not null,
    local_browser_port text not null,
    answers_json text not null,
    created_at text not null,
    updated_at text not null
);

create index if not exists idx_discover_app_setup_catalog_app_id on discover_app_setup_answers(catalog_app_id);
