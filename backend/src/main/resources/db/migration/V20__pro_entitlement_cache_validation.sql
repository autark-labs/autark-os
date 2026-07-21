create trigger if not exists trg_pro_entitlement_cache_validate_insert
before insert on pro_entitlement_cache
for each row
when new.consecutive_failures > 30
    or (
        new.last_failure_category is not null
        and new.last_failure_category not in (
            'network',
            'rate_limited',
            'activation',
            'authorization',
            'control_plane',
            'verification',
            'identity',
            'local_configuration',
            'cache',
            'internal'
        )
    )
begin
    select raise(abort, 'invalid Pro entitlement refresh metadata');
end;

create trigger if not exists trg_pro_entitlement_cache_validate_update
before update on pro_entitlement_cache
for each row
when new.consecutive_failures > 30
    or (
        new.last_failure_category is not null
        and new.last_failure_category not in (
            'network',
            'rate_limited',
            'activation',
            'authorization',
            'control_plane',
            'verification',
            'identity',
            'local_configuration',
            'cache',
            'internal'
        )
    )
begin
    select raise(abort, 'invalid Pro entitlement refresh metadata');
end;
