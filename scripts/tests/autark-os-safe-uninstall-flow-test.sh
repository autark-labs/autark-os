#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 - "${repo_root}" <<'PY'
import json
import os
import pty
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile

repo = Path(sys.argv[1])
cli = repo / 'scripts/autark-os'
with tempfile.TemporaryDirectory(prefix='autark-uninstall-test-') as directory:
    root = Path(directory)
    fake = root / 'bin'
    fake.mkdir()
    (fake / 'id').write_text('#!/bin/sh\n[ "$1" = -u ] && echo 0 || /usr/bin/id "$@"\n')
    (fake / 'systemctl').write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_SERVICE_CALLS"
[ "$TEST_SCENARIO" != missing-unit-bus-failure ] || exit 1
[ "$1" != show ] || { [ "$TEST_SCENARIO" != still-active ] && echo inactive || echo active; exit 0; }
if [ "$1" = disable ] && { [ "$TEST_SCENARIO" = late-install ] || [ "$TEST_SCENARIO" = late-job ]; }; then
  python3 - <<'DB'
import os, sqlite3
with sqlite3.connect(os.environ['TEST_STATE'] + '/runtime/autark-os.db') as db:
    db.execute("INSERT INTO installed_apps VALUES ('late')" if os.environ['TEST_SCENARIO'] == 'late-install' else "INSERT INTO autark_os_jobs VALUES ('queued')")
DB
fi
[ "$TEST_SCENARIO" != stop-failure ]
''')
    (fake / 'sleep').write_text('#!/bin/sh\nexit 0\n')
    (fake / 'curl').write_text('''#!/usr/bin/python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
url = args[-1]
method = args[args.index('-X') + 1] if '-X' in args else 'GET'
state = Path(os.environ['TEST_STATE'])
scenario = os.environ['TEST_SCENARIO']
with open(state / 'api', 'a') as file: file.write(method + ' ' + url + '\\n')
def emit(value): print(json.dumps(value))
def job(status):
    return dict(jobId='job-1', type='uninstall_app', subjectId='vaultwarden', status=status,
                steps=[dict(status='succeeded')])
if url.endswith('/api/admin/security/status'):
    if scenario == 'auth-failure': sys.exit(22)
    emit(dict(authRequired=False))
elif method == 'GET' and url.endswith('/api/apps'):
    if scenario == 'malformed-inventory': print('{}'); sys.exit()
    if scenario == 'unsafe-id': emit([dict(appId='../bad')]); sys.exit()
    emit([] if (state / 'done').exists() and scenario != 'stale-inventory' else [dict(appId='vaultwarden')])
elif method == 'GET' and url.endswith('/api/jobs'):
    emit([job('running')] if scenario == 'busy' else [])
elif method == 'GET' and url.endswith('/uninstall-plan'):
    if scenario == 'plan-failure': sys.exit(22)
    emit(dict(appId='vaultwarden', headline='Remove Vaultwarden', needsConfirmation=['Stops app'], willStop=['App'], willKeep=['Data']))
elif method == 'POST' and url.endswith('/uninstall'):
    if scenario == 'conflict': sys.exit(22)
    emit(job('queued'))
elif method == 'GET' and url.endswith('/api/jobs/job-1'):
    if scenario == 'vanished-job': sys.exit(22)
    if scenario == 'malformed-job': print('not-json'); sys.exit()
    count_file = state / 'polls'
    count = int(count_file.read_text()) + 1 if count_file.exists() else 1
    count_file.write_text(str(count))
    status = 'running' if count == 1 or scenario == 'timeout' else 'succeeded'
    if scenario in ('failed', 'cancelled', 'unknown'): status = scenario
    result = job(status)
    if scenario == 'wrong-subject': result['subjectId'] = 'other'
    if scenario == 'wrong-job': result['jobId'] = 'job-2'
    if scenario == 'wrong-type': result['type'] = 'install_app'
    if status == 'succeeded': (state / 'done').touch()
    emit(result)
else:
    print('Unexpected API request', method, url, file=sys.stderr)
    sys.exit(22)
''')
    for file in fake.iterdir(): file.chmod(0o755)

    def fixture(name):
        base = root / name
        base.mkdir()
        dirs = {key: base / key for key in ('install', 'runtime', 'config', 'logs')}
        for path in dirs.values(): path.mkdir()
        for name in ('apps/vaultwarden/data/marker', 'backups/verified.tar', 'config/identity.json', 'db/database'):
            marker = dirs['runtime'] / name
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text('keep exactly this')
        for key in ('config', 'logs'): (dirs[key] / 'marker').write_text('keep exactly this')
        with sqlite3.connect(dirs['runtime'] / 'autark-os.db') as database:
            database.execute('CREATE TABLE project_settings(setting_key TEXT, setting_value TEXT)')
            database.execute('CREATE TABLE installed_apps(app_id TEXT)')
            database.execute('CREATE TABLE autark_os_jobs(status TEXT)')
        service = base / 'autark.service'
        service.write_text('owned unit')
        link = base / 'autark'
        link.symlink_to(dirs['install'] / 'bin/autark-os')
        env = dict(os.environ, PATH=f'{fake}:/usr/bin:/bin', TEST_STATE=str(base),
                   TEST_SCENARIO='success', TEST_SERVICE_CALLS=str(base / 'service-calls'),
                   AUTARK_OS_CONFIG_FILE=str(dirs['config'] / 'autark-os.env'),
                   AUTARK_OS_PUBLIC_INSTALL_METADATA=str(base / 'no-metadata'),
                   AUTARK_OS_SERVICE_FILE=str(service), AUTARK_OS_CLI_LINK=str(link),
                   AUTARK_OS_BASE_URL='http://127.0.0.1:18082',
                   AUTARK_OS_ADMIN_TOKEN_FILE=str(base / 'token'), AUTARK_OS_ADMIN_TOKEN='',
                   AUTARK_OS_UNINSTALL_JOB_TIMEOUT='1')
        def config():
            Path(env['AUTARK_OS_CONFIG_FILE']).write_text(''.join(f'{key}={dirs[name]}\n' for key, name in (
                ('AUTARK_OS_INSTALL_DIR', 'install'), ('AUTARK_OS_RUNTIME_ROOT', 'runtime'),
                ('AUTARK_OS_CONFIG_DIR', 'config'), ('AUTARK_OS_LOG_DIR', 'logs'))) + 'AUTARK_OS_INSTALL_METHOD=portable\n')
        config()
        return base, dirs, env, config

    def run(env, *args, ok=True):
        result = subprocess.run([cli, 'uninstall', *args], env=env, text=True, capture_output=True, timeout=25)
        assert (result.returncode == 0) == ok, (args, result.returncode, result.stdout, result.stderr)
        return result

    purge = ('--yes', '--remove-data', '--confirm-delete-data', 'DELETE-AUTARK-OS-DATA')
    base, dirs, env, config = fixture('review')
    plan = json.loads(run(env, '--plan', '--json').stdout)
    assert plan['mode'] == 'preserve-runtime-data'
    assert not plan['supportReport']['offeredBeforeRemoval'] and not plan['supportReport']['requested']
    assert str(dirs['runtime']) in plan['preservePaths']
    assert 'installedAppsDetected' not in plan['dockerResources']  # Folders do not prove ownership.
    plan = json.loads(run(env, '--plan', '--json', '--remove-data').stdout)
    assert plan['requiresTypedConfirmation'] and str(dirs['runtime']) in plan['removePaths']
    assert [a['id'] for a in plan['actions']].index('remove-managed-apps') < [a['id'] for a in plan['actions']].index('stop-service')
    run(env, '--yes', '--remove-data', ok=False)
    run(env, '--dry-run', *purge)
    assert not (base / 'service-calls').exists()
    assert (dirs['runtime'] / 'db/database').read_text() == 'keep exactly this'
    run(env, '--yes', '--support-report', str(dirs['install'] / 'lost.tar.gz'), ok=False)
    assert not (base / 'service-calls').exists()

    for name in ('equal', 'nested', 'parent', 'dotdot', 'trailing', 'symlink', 'dangling', 'root', 'backup-alias', 'service-directory', 'backup-destination', 'backup-history'):
        base, dirs, env, config = fixture(name)
        original_runtime = dirs['runtime']
        if name == 'equal': dirs['install'] = dirs['runtime']
        elif name == 'nested': dirs['install'] = base
        elif name == 'parent': dirs['install'] = dirs['runtime'] / 'install'
        elif name == 'dotdot':
            (dirs['runtime'] / 'child').mkdir()
            dirs['install'] = dirs['runtime'] / 'child/..'
        elif name == 'trailing': dirs['install'] = str(dirs['runtime']) + '/'
        elif name in ('symlink', 'dangling'):
            alias = base / 'alias'
            alias.symlink_to(dirs['runtime'] if name == 'symlink' else base / 'missing')
            dirs['install'] = alias
        elif name == 'root': dirs['install'] = Path('/')
        elif name == 'backup-alias':
            (dirs['runtime'] / 'backups/verified.tar').unlink()
            (dirs['runtime'] / 'backups').rmdir()
            (dirs['runtime'] / 'backups').symlink_to(dirs['install'])
        elif name == 'service-directory': env['AUTARK_OS_SERVICE_FILE'] = str(dirs['runtime'])
        elif name in ('backup-destination', 'backup-history'):
            with sqlite3.connect(dirs['runtime'] / 'autark-os.db') as database:
                key = 'backupDestination' if name == 'backup-destination' else 'backupDestinationHistory'
                database.execute('INSERT INTO project_settings VALUES (?, ?)', (key, str(dirs['install'] / 'backups')))
        config()
        result = run(env, '--yes', ok=False)
        assert 'Unsafe Autark-OS path layout' in result.stderr
        assert (original_runtime / 'db/database').read_text() == 'keep exactly this'
        assert not (base / 'service-calls').exists()
        assert not (base / 'api').exists()
        # Collision override must not bypass the same installer layout rule.
        result = subprocess.run([repo / 'scripts/install-autark-os-service.sh', '--dry-run',
            '--install-dir', str(dirs['install']), '--runtime-dir', str(dirs['runtime']),
            '--config-dir', str(dirs['config']), '--log-dir', str(dirs['logs'])],
            env=dict(env, AUTARK_OS_ALLOW_INSTALL_COLLISION='1'), text=True, capture_output=True)
        assert result.returncode != 0 and 'Unsafe Autark-OS path layout' in result.stderr

    for scenario in ('malformed-inventory', 'unsafe-id', 'auth-failure', 'plan-failure', 'conflict', 'busy',
                     'vanished-job', 'malformed-job', 'failed', 'cancelled', 'unknown',
                     'wrong-subject', 'wrong-job', 'wrong-type', 'timeout', 'stale-inventory', 'stop-failure',
                     'still-active', 'late-install', 'late-job', 'missing-unit-bus-failure'):
        base, dirs, env, config = fixture(scenario)
        env['TEST_SCENARIO'] = scenario
        env['AUTARK_OS_UNINSTALL_JOB_TIMEOUT'] = '1' if scenario == 'timeout' else '10'
        if scenario == 'missing-unit-bus-failure': (base / 'autark.service').unlink()
        run(env, *purge, ok=False)
        assert (dirs['runtime'] / 'db/database').read_text() == 'keep exactly this'
        assert dirs['install'].exists() and dirs['config'].exists()
        assert not (base / 'service-calls').exists() or scenario in ('stop-failure', 'still-active', 'late-install', 'late-job', 'missing-unit-bus-failure')
        if scenario in ('stop-failure', 'still-active', 'late-install', 'late-job'):
            assert 'disable --now' in (base / 'service-calls').read_text()

    for mode, args in (('preserve', ('--yes',)), ('config-logs', ('--yes', '--remove-config', '--remove-logs')), ('purge', purge)):
        base, dirs, env, config = fixture(mode)
        env['AUTARK_OS_UNINSTALL_JOB_TIMEOUT'] = '10'
        result = run(env, *args)
        assert not dirs['install'].exists()
        assert not (base / 'autark.service').exists() and not (base / 'autark').is_symlink()
        if mode == 'purge':
            assert all(not path.exists() for path in dirs.values())
            calls = (base / 'api').read_text()
            assert 'DELETE ' not in calls and 'POST http://127.0.0.1:18082/api/apps/vaultwarden/uninstall' in calls
            assert int((base / 'polls').read_text()) == 2
        else:
            for name in ('apps/vaultwarden/data/marker', 'backups/verified.tar', 'config/identity.json', 'db/database'):
                assert (dirs['runtime'] / name).read_text() == 'keep exactly this'
            assert f'Preserved {dirs["runtime"]}' in result.stdout
            if mode == 'preserve':
                for key in ('config', 'logs'): assert (dirs[key] / 'marker').read_text() == 'keep exactly this'
            assert not (base / 'api').exists()
    for choice, answer, success in (('keep', '\\ny\\nn\\n', True), ('erase', 'y\\nDELETE-AUTARK-OS-DATA\\ny\\nn\\n', True), ('mistyped', 'y\\nDELETE\\n', False)):
        base, dirs, env, config = fixture('interactive-' + choice)
        env['AUTARK_OS_UNINSTALL_JOB_TIMEOUT'] = '10'
        master, slave = pty.openpty()
        process = subprocess.Popen([cli, 'uninstall'], env=env, stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        os.close(slave)
        os.write(master, answer.replace('\\n', '\n').encode())
        stdout, stderr = process.communicate(timeout=25)
        os.close(master)
        assert (process.returncode == 0) == success, (choice, stdout, stderr)
        assert dirs['runtime'].exists() == (choice != 'erase')
        if choice == 'mistyped': assert not (base / 'service-calls').exists()

    base, dirs, env, config = fixture('export-failure')
    (fake / 'tar').write_text('#!/bin/sh\nexit 77\n')
    (fake / 'tar').chmod(0o755)
    result = run(env, '--yes', '--support-report', str(base / 'support.tar.gz'), ok=False)
    assert 'Support export failed' in result.stderr
    assert (dirs['runtime'] / 'db/database').read_text() == 'keep exactly this'
    # Diagnostic service reads are fine; stopping it after a failed export is not.
    assert 'disable' not in (base / 'service-calls').read_text()
    print('PASS: uninstall plans, preservation, path aliases, installer guards, current API jobs, and fail-closed cleanup')
PY
