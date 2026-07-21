create table pro_guardian_analysis_runs(
    run_id text primary key,
    trigger_type text not null
        check(trigger_type in ('initial', 'scheduled', 'ce-event', 'explicit')),
    status text not null
        check(status in ('succeeded', 'partial', 'failed', 'skipped')),
    grant_fingerprint text not null,
    active_digest text not null,
    snapshot_id text,
    snapshot_generated_at text,
    partial_data integer not null default 0
        check(partial_data in (0, 1)),
    finding_count integer not null default 0
        check(finding_count between 0 and 200),
    presentation_json text
        check(presentation_json is null or length(presentation_json) <= 262144),
    continuation_token text
        check(continuation_token is null or length(continuation_token) <= 262144),
    error_code text,
    started_at text not null,
    completed_at text not null
);

create index idx_pro_guardian_runs_authority_completed
    on pro_guardian_analysis_runs(
        grant_fingerprint,
        active_digest,
        completed_at desc
    );

create table pro_guardian_findings(
    finding_id text primary key,
    insight_id text not null,
    feature_id text not null
        check(feature_id glob 'pro.*' and length(feature_id) <= 64),
    rule_id text not null,
    dedupe_key text not null,
    rule_version text not null,
    severity text not null
        check(severity in ('critical', 'high', 'medium', 'low', 'info')),
    confidence text not null
        check(confidence in ('high', 'medium', 'low')),
    title text not null check(length(title) between 1 and 160),
    summary text not null check(length(summary) between 1 and 2000),
    agent_first_observed_at text not null,
    agent_last_observed_at text not null,
    affected_resource_ref text,
    evidence_json text not null check(length(evidence_json) <= 65536),
    route_id text not null,
    action_id text not null,
    navigation_label text not null check(length(navigation_label) between 1 and 80),
    lifecycle_state text not null
        check(lifecycle_state in ('OPEN', 'SNOOZED', 'RESOLVED', 'DISMISSED', 'REGRESSED')),
    first_seen_at text not null,
    last_seen_at text not null,
    resolved_at text,
    snoozed_until text,
    acknowledged_at text,
    user_note text check(user_note is null or length(user_note) <= 500),
    occurrence_count integer not null
        check(occurrence_count between 1 and 2147483647),
    episode integer not null
        check(episode between 1 and 2147483647),
    last_run_id text not null,
    created_at text not null,
    updated_at text not null,
    unique(rule_id, dedupe_key),
    foreign key(last_run_id) references pro_guardian_analysis_runs(run_id)
);

create index idx_pro_guardian_findings_state_priority
    on pro_guardian_findings(lifecycle_state, severity, last_seen_at desc);

create index idx_pro_guardian_findings_resolved
    on pro_guardian_findings(resolved_at)
    where resolved_at is not null;
