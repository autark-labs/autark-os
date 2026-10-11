#!/usr/bin/env python3
"""Fail closed before installing or removing an appliance with overlapping paths."""

import argparse
from pathlib import Path
import re
import sqlite3
import sys


def resolved(value):
    path = Path(value)
    if not path.is_absolute() or any(c in value for c in "\n\r\0"):
        raise ValueError(f"Use an unambiguous absolute path: {value!r}")
    # strict=False allows new installations, but must not hide dangling links.
    for part in (path, *path.parents):
        if part.is_symlink() and not part.exists():
            raise ValueError(f"Cannot resolve symbolic link: {part}")
    return path.resolve()


def overlaps(a, b):
    return a == b or a in b.parents or b in a.parents


def validate(args):
    roots = dict(zip(("install", "runtime", "config", "logs"), args.roots))
    paths = {name: resolved(value) for name, value in roots.items()}
    system_roots = [resolved(p) for p in (
        "/", "/opt", "/etc", "/usr", "/bin", "/sbin", "/var", "/var/lib",
        "/var/log", "/home", "/root", "/tmp", "/run", "/mnt", "/media",
        "/dev", "/proc", "/sys", "/boot",
    )]
    for name, path in paths.items():
        if any(Path(root) in path.parents for root in ("/proc", "/sys", "/dev", "/boot")):
            raise ValueError(f"{name} path is inside a system directory: {path}")
        if any(path == root or path in root.parents for root in system_roots):
            raise ValueError(f"{name} path is a shared system directory: {path}")
        if path.exists() and not path.is_dir():
            raise ValueError(f"{name} path is not a directory: {path}")
        # Removing a directory symlink only unlinks it, which contradicts a purge.
        if Path(roots[name]).is_symlink():
            raise ValueError(f"{name} path is a symbolic link; use its real directory: {path}")
        for other, other_path in paths.items():
            if name != other and overlaps(path, other_path):
                raise ValueError(f"{name} ({path}) overlaps {other} ({other_path})")
    internal_backups = resolved(str(paths["runtime"] / "backups"))
    backup_paths = {internal_backups}
    database = paths["runtime"] / "autark-os.db"
    if args.require_idle_runtime and not database.is_file():
        raise ValueError("Cannot verify the stopped runtime database before deleting data")
    if database.exists():
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
            settings = connection.execute(
                "SELECT setting_value FROM project_settings "
                "WHERE setting_key IN ('backupDestination', 'backupDestinationHistory')"
            ).fetchall()
            if args.require_idle_runtime:
                if connection.execute("SELECT COUNT(*) FROM installed_apps").fetchone()[0]:
                    raise ValueError("An app was registered during uninstall; restart Autark-OS and review My Apps")
                if connection.execute(
                    "SELECT COUNT(*) FROM autark_os_jobs WHERE status NOT IN ('succeeded', 'failed', 'cancelled', 'canceled')"
                ).fetchone()[0]:
                    raise ValueError("An operation was unfinished at shutdown; restart Autark-OS and review Activity")
        backup_paths.update(resolved(value) for row in settings for value in row[0].splitlines() if value.strip())
    for backup in backup_paths:
        for name, path in paths.items():
            if name == "runtime" and backup == internal_backups:
                continue
            if overlaps(backup, path):
                raise ValueError(f"backups ({backup}) overlaps {name} ({path})")
    for value in (args.service_file, args.cli_link):
        if not value:
            continue
        leaf = Path(value)
        # The CLI is normally a symlink to the install tree. Validate the entry
        # being unlinked, not its target, and never recursively remove a directory.
        entry = resolved(str(leaf.parent)) / leaf.name
        if not leaf.is_absolute() or leaf.name in ("", ".", ".."):
            raise ValueError(f"Invalid service/command path: {value}")
        if leaf.is_dir() and not leaf.is_symlink():
            raise ValueError(f"Service/command path is a directory: {value}")
        if any(overlaps(entry, path) for path in paths.values()):
            raise ValueError(f"Service/command entry overlaps an appliance directory: {entry}")
    removals = [
        resolved(str(Path(value).parent)) / Path(value).name
        if value in (args.service_file, args.cli_link) else resolved(value)
        for value in args.remove
    ]
    # rm -rf traverses mount points, including bind mounts on the same device.
    # Never let a purge's promise to preserve external drives depend on st_dev.
    if removals:
        for line in Path("/proc/self/mountinfo").read_text().splitlines():
            mount = Path(re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), line.split()[4]))
            if any(mount == path or path in mount.parents for path in removals):
                raise ValueError(f"Removal would cross a mounted filesystem: {mount}; unmount it first")
    if args.report:
        report = resolved(args.report)
        for removal in removals:
            if report == removal or removal in report.parents:
                raise ValueError(f"Support report would be removed: {report}")
        if report.exists():
            raise ValueError(f"Support report already exists; choose a new file: {report}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roots", nargs=4, metavar="DIRECTORY")
    parser.add_argument("--service-file")
    parser.add_argument("--cli-link")
    parser.add_argument("--report")
    parser.add_argument("--remove", action="append", default=[])
    parser.add_argument("--require-idle-runtime", action="store_true")
    try:
        validate(parser.parse_args())
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
        sys.exit(f"Unsafe Autark-OS path layout: {error}. Filesystem removal is blocked. "
                 "Use separate installation, runtime, config, and log directories; "
                 "back up an existing layout before relocating it manually.")
