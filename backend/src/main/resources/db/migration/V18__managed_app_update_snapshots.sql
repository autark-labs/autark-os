create table if not exists app_update_snapshots(
    snapshot_id text primary key,
    app_id text not null,
    app_name text not null,
    operation_kind text not null,
    from_version text not null,
    to_version text not null,
    snapshot_path text not null,
    safety_restore_point_id integer,
    status text not null,
    message text not null default '',
    created_at text not null,
    updated_at text not null
);

create index if not exists idx_app_update_snapshots_app_created
    on app_update_snapshots(app_id, created_at desc);

create index if not exists idx_app_update_snapshots_status
    on app_update_snapshots(status, updated_at desc);
