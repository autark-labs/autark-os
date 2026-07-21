alter table activity_logs
add column event_key text;

create unique index idx_activity_logs_event_key
on activity_logs(event_key)
where event_key is not null;

create trigger prevent_pro_audit_update
before update on activity_logs
when old.category = 'pro'
begin
    select raise(abort, 'Autark Pro audit records are append-only');
end;

create trigger prevent_pro_audit_delete
before delete on activity_logs
when old.category = 'pro'
begin
    select raise(abort, 'Autark Pro audit records are append-only');
end;
