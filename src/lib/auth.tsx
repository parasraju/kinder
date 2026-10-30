import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, UserPreferences } from "@shared/types";
import { authApi } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_KEY = ["auth", "me"] as const;

function applyAppearance(prefs: Pick<UserPreferences, "theme" | "density" | "reduceMotion">) {
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = prefs.theme === "system" ? (systemDark ? "dark" : "light") : prefs.theme;
  root.dataset.theme = theme;
  root.dataset.density = prefs.density;
  root.dataset.reduceMotion = String(prefs.reduceMotion);
  try {
    localStorage.setItem("ka.appearance", JSON.stringify(prefs));
  } catch {
    /* storage is optional */
  }
}

export function readStoredAppearance(): Pick<UserPreferences, "theme" | "density" | "reduceMotion"> {
  try {
    const raw = localStorage.getItem("ka.appearance");
    if (!raw) return { theme: "light", density: "comfortable", reduceMotion: false };
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      theme: parsed.theme ?? "light",
      density: parsed.density ?? "comfortable",
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return { theme: "light", density: "comfortable", reduceMotion: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await authApi.me()).user,
    staleTime: 30_000,
  });

  const user = meQuery.data ?? null;

  useEffect(() => {
    if (user) applyAppearance(user.preferences);
  }, [user]);

  useEffect(() => {
    if (!user && !meQuery.isLoading) applyAppearance(readStoredAppearance());
  }, [user, meQuery.isLoading]);

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.setQueryData(ME_KEY, null);
    };
    window.addEventListener("ka:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("ka:unauthorized", handleUnauthorized);
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_KEY, data.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({ name, email, password }: { name: string; email: string; password: string }) =>
      authApi.register(name, email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_KEY, data.user);
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: meQuery.isLoading,
      login: async (email, password) => {
        const data = await loginMutation.mutateAsync({ email, password });
        return data.user;
      },
      register: async (name, email, password) => {
        const data = await registerMutation.mutateAsync({ name, email, password });
        return data.user;
      },
      logout: async () => {
        await authApi.logout();
        queryClient.setQueryData(ME_KEY, null);
        queryClient.clear();
      },
      refresh: async () => {
        const data = await authApi.me();
        queryClient.setQueryData(ME_KEY, data.user);
      },
      updatePreferences: async (prefs) => {
        const data = await authApi.updatePreferences(prefs);
        queryClient.setQueryData(ME_KEY, (current: User | null | undefined) =>
          current ? { ...current, preferences: data.preferences } : current,
        );
        applyAppearance(data.preferences);
      },
    }),
    [user, meQuery.isLoading, loginMutation, registerMutation, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
