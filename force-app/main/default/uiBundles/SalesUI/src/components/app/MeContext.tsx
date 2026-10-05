import { createContext, useContext } from 'react';
import type { Me } from '@/api/salesTypes';

export const MeContext = createContext<Me | null>(null);

/** The signed-in Salesforce user and their app capabilities (loaded once by the shell). */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe must be used inside the app shell');
  return me;
}
