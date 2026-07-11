-- Keep the historical Pro migrations intact so existing installations retain a
-- valid Flyway history. This migration removes all persisted Pro runtime data
-- now that Pro is delivered as a separate application.
drop table if exists pro_mobile_pairing;
drop table if exists pro_notifications;
drop table if exists pro_feed_cache;
drop table if exists pro_settings;
