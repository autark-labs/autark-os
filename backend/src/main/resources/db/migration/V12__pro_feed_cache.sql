create table if not exists pro_feed_cache(
    id text primary key,
    item_type text,
    severity text,
    title text not null,
    body text,
    published_at text,
    cached_order integer not null default 0
);
