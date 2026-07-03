create table if not exists autark_os_jobs(
    job_id text primary key,
    job_type text not null,
    subject_id text,
    status text not null,
    current_step text,
    steps_json text not null,
    error_code text,
    error_message text,
    error_details_json text not null default '{}',
    created_at text not null,
    updated_at text not null
);

create index if not exists idx_autark_os_jobs_status on autark_os_jobs(status);
create index if not exists idx_autark_os_jobs_type_subject on autark_os_jobs(job_type, subject_id);
create index if not exists idx_autark_os_jobs_updated_at on autark_os_jobs(updated_at desc);
