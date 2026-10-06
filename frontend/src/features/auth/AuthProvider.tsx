import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "../../api/ApiClient";
import { queryClient } from "../../api/queryClient";
import type { Me } from "../../api/types";
import { authApi } from "./authApi";
interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  error: unknown;
  sessionExpired: boolean;
  passwordChanged: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (user: Me) => void;
  clearSession: (reason?: "password-changed") => void;
  getDraft: <T>(key: string) => T | undefined;
  setDraft: (key: string, value: unknown) => void;
  removeDraft: (key: string) => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const lastUserId = useRef<string | null>(null);
  const drafts = useRef(new Map<string, unknown>());
  const clearSession = useCallback((reason?: "password-changed") => {
    setPasswordChanged(reason === "password-changed");
    setUser(null);
    lastUserId.current = null;
    drafts.current.clear();
    queryClient.clear();
    api.clearCsrf();
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUser(await authApi.me());
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401)) setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((value) => {
        if (alive) {
          lastUserId.current = value.id;
          setUser(value);
        }
      })
      .catch((e) => {
        if (alive && !(e instanceof ApiError && e.status === 401)) setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    api.onSessionError((code) => {
      if (code === "PASSWORD_CHANGE_REQUIRED") {
        void refresh();
      } else if (code !== "INVALID_CREDENTIALS") {
        if (lastUserId.current) setSessionExpired(true);
        setUser(null);
        queryClient.clear();
        api.clearCsrf();
      }
    });
    return () => api.onSessionError(null);
  }, [refresh]);
  async function login(email: string, password: string) {
    const next = await authApi.login(email, password);
    queryClient.clear();
    if (lastUserId.current !== next.id) {
      drafts.current.clear();
    }
    lastUserId.current = next.id;
    setUser(next);
    setSessionExpired(false);
    setPasswordChanged(false);
    setError(null);
    api.clearCsrf();
    return next;
  }
  async function logout() {
    await authApi.logout();
    clearSession();
    setSessionExpired(false);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        sessionExpired,
        passwordChanged,
        login,
        logout,
        refresh,
        updateUser: setUser,
        clearSession,
        getDraft: <T,>(key: string) => drafts.current.get(key) as T | undefined,
        setDraft: (key, value) => {
          drafts.current.set(key, value);
        },
        removeDraft: (key) => {
          drafts.current.delete(key);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
