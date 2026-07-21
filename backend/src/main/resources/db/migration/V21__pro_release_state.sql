create table if not exists pro_release_state(
    component text not null,
    release_channel text not null,
    highest_sequence integer not null check (highest_sequence > 0),
    manifest_fingerprint text not null check (
        manifest_fingerprint glob 'sha256:*'
        and length(manifest_fingerprint) = 71
    ),
    digest text not null check (
        digest glob 'sha256:*'
        and length(digest) = 71
    ),
    accepted_at text not null,
    primary key (component, release_channel)
);

create table if not exists pro_release_history(
    component text not null,
    release_channel text not null,
    manifest_sequence integer not null check (manifest_sequence > 0),
    manifest_fingerprint text not null,
    digest text not null,
    version text not null,
    accepted_at text not null,
    known_good_at text,
    primary key (component, release_channel, manifest_sequence),
    unique (component, release_channel, manifest_fingerprint),
    unique (component, release_channel, digest),
    check (
        manifest_fingerprint glob 'sha256:*'
        and length(manifest_fingerprint) = 71
    ),
    check (digest glob 'sha256:*' and length(digest) = 71)
);

create index if not exists pro_release_history_known_good_idx
    on pro_release_history(component, release_channel, digest)
    where known_good_at is not null;
