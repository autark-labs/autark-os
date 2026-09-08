create table app_settings_recovery (
    app_id text primary key references installed_apps(app_id) on delete cascade,
    snapshot text not null
);
