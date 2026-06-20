export function installJobReducer(state, action) {
  switch (action.type) {
    case 'start':
      return startInstallJob(state, action);
    case 'complete':
      return completeInstallJob(state, action);
    case 'fail':
      return failInstallJob(state, action);
    case 'reset':
      return { status: 'idle' };
    default:
      return state;
  }
}

export function startInstallJob(state, job) {
  if (state.status === 'active' && state.active.appId !== job.appId) {
    return {
      ...state,
      blocked: {
        appId: job.appId,
        appName: job.appName,
        message: `${state.active.appName} is installing. Finish that install before starting ${job.appName}.`,
      },
    };
  }
  return {
    status: 'active',
    active: {
      appId: job.appId,
      appName: job.appName,
      mode: job.mode || 'install',
      startedAt: job.startedAt || new Date().toISOString(),
    },
  };
}

export function completeInstallJob(state, result) {
  if (state.status !== 'active' || state.active.appId !== result.appId) {
    return state;
  }
  return {
    status: 'completed',
    completed: {
      appId: result.appId,
      appName: state.active.appName,
      mode: state.active.mode,
      status: result.status,
      message: result.message,
      completedAt: result.completedAt || new Date().toISOString(),
    },
  };
}

export function failInstallJob(state, failure) {
  if (state.status !== 'active' || state.active.appId !== failure.appId) {
    return state;
  }
  return {
    status: 'failed',
    failed: {
      appId: failure.appId,
      appName: state.active.appName,
      mode: state.active.mode,
      message: failure.message,
      failedAt: failure.failedAt || new Date().toISOString(),
    },
  };
}

export function canStartInstall(state, appId) {
  return state.status !== 'active' || state.active.appId === appId;
}

export function activeInstallMessage(state, appId) {
  if (state.status !== 'active') {
    return '';
  }
  if (state.active.appId === appId) {
    return `${state.active.appName} is installing. Keep this page open while Project OS finishes setup.`;
  }
  return `${state.active.appName} is installing. Finish that install before starting another app.`;
}

export function modeLabel(mode) {
  if (mode === 'reset-reinstall') {
    return 'Reset and reinstall';
  }
  if (mode === 'reinstall') {
    return 'Reinstall';
  }
  return 'Install';
}
