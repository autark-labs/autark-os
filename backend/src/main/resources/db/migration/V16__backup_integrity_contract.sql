alter table app_backups add column integrity_baseline_sha256 text;
alter table app_backups add column backup_contract_strategy text not null default 'legacy_unverified';
alter table app_backups add column backup_contract_version integer not null default 0;

-- Previous releases calculated a checksum during verification instead of retaining
-- an immutable creation-time baseline. Keep those restore points visible, but never
-- present them as verified or safe to restore automatically.
update app_backups
set verification_status = 'legacy_unverified',
    verification_message = 'This restore point was created before Autark-OS recorded an immutable integrity baseline. Create a new backup before restoring.',
    restore_confidence = 'unknown'
where verification_status = 'verified'
   or integrity_baseline_sha256 is null
   or trim(integrity_baseline_sha256) = '';
