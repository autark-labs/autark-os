create table if not exists pro_notifications(
    id text primary key,
    severity text,
    notification_type text,
    title text not null,
    body text,
    created_at text,
    received_at text not null,
    payload_json text
);

create index if not exists pro_notifications_created_at_idx
    on pro_notifications(created_at desc, received_at desc);
