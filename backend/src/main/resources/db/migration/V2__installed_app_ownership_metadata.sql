alter table installed_apps add column app_instance_id text not null default '';
alter table installed_apps add column catalog_app_id text not null default '';
alter table installed_apps add column autark_os_instance_id text not null default '';
alter table installed_apps add column runtime_path_or_hash text not null default '';
alter table installed_apps add column install_state text not null default 'ownership_uncertain';
alter table installed_apps add column ownership_status text not null default 'ownership_uncertain';
alter table installed_apps add column created_at text not null default '';
alter table installed_apps add column updated_at text not null default '';

update installed_apps
set catalog_app_id = app_id,
    runtime_path_or_hash = runtime_path,
    install_state = 'legacy_unscoped',
    ownership_status = 'legacy_unscoped',
    created_at = installed_at,
    updated_at = installed_at
where app_instance_id = '';
