import { useQuery } from '@tanstack/react-query';
import { SystemAPIClient } from '@/api/SystemAPIClient';
import type { SystemDoctorStatus } from '@/types/system';

export const systemQueryKeys = {
  all: ['system'] as const,
  doctor: ['system', 'doctor'] as const,
};

export function useSystemDoctorQuery() {
  return useQuery<SystemDoctorStatus>({
    queryKey: systemQueryKeys.doctor,
    queryFn: () => SystemAPIClient.doctor(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
