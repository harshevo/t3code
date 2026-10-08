import type { ReactNode } from "react";
export const T3_CONNECT_ACCOUNT_PAGES = [] as const;
export function useT3ConnectAccountPage(): {
  readonly open: (() => void) | null;
  readonly portals: ReactNode;
} {
  return { open: null, portals: null };
}
