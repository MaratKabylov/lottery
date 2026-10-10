import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(url && key && !key.startsWith("replace-"));
export const supabase = createClient<Database>(
  url || "http://127.0.0.1:54321",
  key || "not-configured",
);
