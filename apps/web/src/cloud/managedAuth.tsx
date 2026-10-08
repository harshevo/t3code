import { setManagedRelaySession } from "@t3tools/client-runtime/relay";
import { appAtomRegistry } from "../rpc/atomRegistry";
import type { ReactNode } from "react";
export function deactivateManagedRelayAuthentication(): void {
  setManagedRelaySession(appAtomRegistry, null);
}
export function activateManagedRelayAuthentication(
  _accountId: string,
  _readToken: () => Promise<string | null>,
): void {
  deactivateManagedRelayAuthentication();
}
export function ManagedRelayAuthProvider({ children }: { readonly children: ReactNode }) {
  return children;
}
