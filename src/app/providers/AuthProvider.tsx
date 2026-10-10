import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "../../lib/supabase";
import type { Profile } from "../../types/database";
import { useQueryClient } from "@tanstack/react-query";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};
const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  error: null,
});
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: isConfigured,
    error: null,
  });
  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    let generation = 0;
    async function load(session: Session | null) {
      const token = ++generation;
      if (!session) {
        if (alive)
          setState({
            session: null,
            profile: null,
            loading: false,
            error: null,
          });
        return;
      }
      setState({ session, profile: null, loading: true, error: null });
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (alive && token === generation)
        setState({
          session,
          profile: data,
          loading: false,
          error: error ? "Не удалось загрузить права доступа" : null,
        });
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error && alive)
        setState({
          session: null,
          profile: null,
          loading: false,
          error: error.message,
        });
      else if (alive && generation === 0) void load(data.session);
    });
    // Defer profile requests outside the Auth callback to avoid its internal lock.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || event === "SIGNED_IN")
          queryClient.clear();
        setTimeout(() => {
          if (alive) void load(session);
        }, 0);
      },
    );
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
