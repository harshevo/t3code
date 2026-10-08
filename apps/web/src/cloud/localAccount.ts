export function useAuth(_options?: unknown) {
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async (_options?: unknown): Promise<string | null> => null,
  };
}
