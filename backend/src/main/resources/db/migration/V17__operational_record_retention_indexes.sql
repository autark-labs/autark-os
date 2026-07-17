-- Retention and recent-history queries run on a small appliance database.
-- These indexes keep pruning and the user-visible activity/job lists bounded.
create index if not exists idx_activity_logs_level_created_at on activity_logs(level, created_at desc);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_autark_os_jobs_status_updated_at on autark_os_jobs(status, updated_at desc);
create index if not exists idx_app_backups_app_created_at on app_backups(app_id, created_at desc);
create index if not exists idx_app_backups_scope_source_created_at on app_backups(backup_scope, backup_source, created_at desc);
