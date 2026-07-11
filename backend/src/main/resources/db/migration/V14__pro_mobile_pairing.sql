create table if not exists pro_mobile_pairing(
    id integer primary key check (id = 1),
    mobile_device_id text,
    paired_at text,
    last_test_notification_at text,
    last_test_notification_result text
);
