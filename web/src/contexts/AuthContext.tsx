import {useQueryClient} from '@tanstack/react-query';
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {fetchMe, logout as revokeSession} from '@/api/auth';
import {tokenStorage, UNAUTHORIZED_EVENT} from '@/api/client';
import type {AuthResponse, User} from '@/api/types';

interface AuthContextValue {
  isLoading: boolean;
  login: (response: AuthResponse) => void;
  logout: () => void;
  /** Re-reads the current account, after something changed its memberships. */
  refresh: () => Promise<void>;
  user?: User;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({children}: {children: ReactNode}) => {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(tokenStorage.get()));
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tokenStorage.get()) return;

    fetchMe()
      .then(setUser)
      .catch(() => tokenStorage.clear())
      .finally(() => setIsLoading(false));
  }, []);

  // Every cached answer belongs to the previous account: on a shared browser, the next person
  // must not see the teams of the last one.
  const login = useCallback(
    (response: AuthResponse) => {
      queryClient.clear();
      tokenStorage.set(response.token);
      setUser(response.user);
      setIsLoading(false);
    },
    [queryClient],
  );

  // Revoking server side matters: sessions are opaque rows, not self-contained tokens, so
  // dropping the local copy alone would leave a usable session behind.
  const logout = useCallback(() => {
    void revokeSession().catch(() => undefined);
    tokenStorage.clear();
    queryClient.clear();
    setUser(undefined);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    queryClient.clear();
    setUser(await fetchMe());
  }, [queryClient]);

  // An expired or revoked session signs out instead of leaving every page in error.
  useEffect(() => {
    const signOut = () => {
      queryClient.clear();
      setUser(undefined);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, signOut);

    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [queryClient]);

  const value = useMemo(
    () => ({isLoading, login, logout, refresh, user}),
    [isLoading, login, logout, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
