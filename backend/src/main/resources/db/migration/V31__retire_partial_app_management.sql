update installed_apps
set install_state = 'recovery_required',
    updated_at = case when updated_at = '' then installed_at else updated_at end
where lower(install_state) like 'adopted%';
