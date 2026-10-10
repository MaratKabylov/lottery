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
    async function load(session: Session | null, token: number) {
      if (!alive || token !== generation) return;
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
      try {
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
      } catch {
        if (alive && token === generation)
          setState({
            session,
            profile: null,
            loading: false,
            error: "Не удалось загрузить права доступа",
          });
      }
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || generation !== 0) return;
      if (error)
        setState({
          session: null,
          profile: null,
          loading: false,
          error: error.message,
        });
      else void load(data.session, ++generation);
    });
    // Defer profile requests outside the Auth callback to avoid its internal lock.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!alive) return;
        // Invalidate in-flight profile reads immediately, before the deferred request.
        const token = ++generation;
        if (event === "SIGNED_OUT" || event === "SIGNED_IN")
          queryClient.clear();
        setState({
          session,
          profile: null,
          loading: Boolean(session),
          error: null,
        });
        setTimeout(() => {
          void load(session, token);
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
