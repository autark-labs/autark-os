import { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { AdminSecurityAPIClient, type AdminSecurityStatus } from '@/api/AdminSecurityAPIClient';
import { apiErrorMessage } from '@/api/httpClient';
import { writeAdminToken } from '@/lib/adminSecuritySession';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { ProjectPrimaryButton } from '@/components/primitives/ProjectButtons';
import { Input } from '@/components/ui/input';

type AdminSecurityGateProps = {
  status: AdminSecurityStatus;
  onAuthenticated: () => void;
};

function AdminSecurityGate({ status, onAuthenticated }: AdminSecurityGateProps) {
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState(status.setupCode || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitDisabled = busy || password.length < 12 || (!status.claimed && !setupCode.trim());
  const submitDisabledReason = busy
    ? 'Autark-OS is already checking this admin login.'
    : password.length < 12
      ? 'Enter an admin password with at least 12 characters.'
      : 'Confirm the setup code before claiming Autark-OS.';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const session = status.claimed
        ? await AdminSecurityAPIClient.login(password)
        : await AdminSecurityAPIClient.claim(setupCode, password);
      if (!session.authorized || !session.token) {
        setError(session.message || 'Autark-OS could not verify this admin login.');
        return;
      }
      writeAdminToken(session.token);
      onAuthenticated();
    } catch (submitError) {
      setError(apiErrorMessage(submitError, 'Autark-OS could not verify this admin login.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-800 p-5 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-sky-400/30 bg-slate-900 p-6 shadow-xl shadow-slate-950/30">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
            {status.claimed ? <Lock className="size-5" /> : <ShieldCheck className="size-5" />}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-cyan-200">{status.claimed ? 'Admin login' : 'Claim Autark-OS'}</p>
            <h1 className="mt-2 text-2xl font-black text-white">{status.claimed ? 'Unlock this dashboard' : 'Protect this dashboard'}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">{status.message}</p>
          </div>
        </div>

        {!status.claimed && (
          <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-semibold text-white">Setup code</p>
            <p className="mt-1 font-mono text-lg tracking-widest">{status.setupCode}</p>
          </div>
        )}

        <div className="mt-5 grid gap-3">
          {!status.claimed && (
            <label className="grid gap-2 text-sm">
              <span className="font-semibold text-slate-200">Confirm setup code</span>
              <Input className="border-sky-400/25 bg-slate-800 text-white" onChange={(event) => setSetupCode(event.target.value)} value={setupCode} />
            </label>
          )}
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-slate-200">Admin password</span>
            <Input className="border-sky-400/25 bg-slate-800 text-white" minLength={12} onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

        <DisabledAction className="mt-5 w-full" disabled={submitDisabled} reason={submitDisabledReason}>
          <ProjectPrimaryButton className="w-full" disabled={submitDisabled} onClick={submit} type="button">
            {status.claimed ? 'Log in' : 'Claim and continue'}
          </ProjectPrimaryButton>
        </DisabledAction>
      </section>
    </main>
  );
}

export default AdminSecurityGate;
