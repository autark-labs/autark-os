create table if not exists host_inventory_ignores(
    resource_id text primary key,
    ignored_at text not null
);
