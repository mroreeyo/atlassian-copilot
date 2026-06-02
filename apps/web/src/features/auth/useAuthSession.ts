import { useQuery } from '@tanstack/react-query';
import { getAuthSession } from '../../services/copilot/brokerCopilotClient';

export const authSessionQueryKey = ['auth-session'] as const;

export function useAuthSession() {
  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: getAuthSession,
    retry: false,
    staleTime: 60_000
  });
}
