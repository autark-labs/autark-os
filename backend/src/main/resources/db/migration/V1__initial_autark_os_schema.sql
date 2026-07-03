create table if not exists activity_logs(
    id integer primary key autoincrement,
    level text not null,
    category text not null,
    action text not null,
    title text not null,
    message text not null,
    app_id text,
    outcome text not null,
    details text not null,
    created_at text not null
);

create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_activity_logs_app_id on activity_logs(app_id);

create table if not exists installed_apps(
    app_id text primary key,
    app_name text not null,
    status text not null,
    runtime_path text not null,
    compose_project text not null,
    access_url text,
    installed_at text not null
);

create table if not exists app_events(
    id integer primary key autoincrement,
    app_id text not null,
    event_type text not null,
    message text not null,
    created_at text not null
);

create table if not exists app_health(
    app_id text primary key,
    status text not null,
    message text,
    detail text,
    docker_status text,
    local_access_status text,
    private_access_status text,
    startup_grace integer not null default 0,
    checked_at text not null
);

create table if not exists app_backups(
    id integer primary key autoincrement,
    app_id text not null,
    app_name text,
    backup_scope text not null default 'app',
    backup_source text not null default 'manual',
    included_app_ids text,
    backup_path text not null,
    status text not null,
    size_bytes integer not null default 0,
    message text,
    verification_status text not null default 'not_checked',
    verification_message text,
    checksum_sha256 text,
    restore_confidence text not null default 'unknown',
    verified_at text,
    created_at text not null
);

create index if not exists idx_app_backups_app_id on app_backups(app_id);
create index if not exists idx_app_backups_created_at on app_backups(created_at desc);

create table if not exists installed_app_settings(
    app_id text primary key,
    access_url text,
    private_access_url text,
    tailscale_enabled integer not null,
    storage_subfolders text not null,
    backup_enabled integer not null,
    backup_frequency text not null,
    backup_retention integer not null,
    desired_access_mode text,
    private_access_requirement text,
    expected_local_port integer,
    expected_protocol text,
    last_access_check_at text,
    last_successful_access_at text,
    last_repair_attempt_at text,
    last_repair_status text,
    auto_repair_enabled integer not null default 1
);

create table if not exists project_settings(
    setting_key text primary key,
    setting_value text not null,
    updated_at text not null
);

create table if not exists settings(
    setting_key text primary key,
    setting_value text not null
);

create table if not exists app_storage_samples(
    id integer primary key autoincrement,
    app_id text not null,
    used_bytes integer not null,
    sampled_at text not null
);

create index if not exists idx_app_storage_samples_app_time on app_storage_samples(app_id, sampled_at);

create table if not exists host_metric_samples(
    id integer primary key autoincrement,
    system_cpu_percent real not null,
    process_cpu_percent real not null,
    used_memory_percent real not null,
    runtime_used_percent real not null,
    total_memory_bytes integer not null,
    free_memory_bytes integer not null,
    runtime_total_bytes integer not null,
    runtime_usable_bytes integer not null,
    sampled_at text not null
);

create table if not exists app_metric_samples(
    id integer primary key autoincrement,
    app_id text not null,
    cpu_percent real not null,
    memory_percent real not null,
    memory_usage text,
    sampled_at text not null
);

create index if not exists idx_host_metric_samples_sampled_at on host_metric_samples(sampled_at);
create index if not exists idx_app_metric_samples_sampled_at on app_metric_samples(sampled_at);

create table if not exists device_trust_metadata(
    device_id text primary key,
    nickname text not null,
    trust_group text not null,
    trusted integer not null,
    notes text not null,
    updated_at text not null
);
