type DiscoverInstallOptions = {
  duplicateAcknowledged?: boolean;
  reinstall?: boolean;
};

export function buildDiscoverInstallRequest(
  answers: Record<string, unknown> = {},
  options: DiscoverInstallOptions = {},
) {
  return {
    answers,
    ...(options.reinstall ? { reinstall: true } : {}),
    ...(options.duplicateAcknowledged ? { duplicateAcknowledged: true } : {}),
  };
}
