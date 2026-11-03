import "server-only";
import { createClient } from "@supabase/supabase-js";

// Secret key: this file must never be imported by a Client Component.
export const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).storage.from("photos");

export const SIGNED_LINK_SECONDS = 60 * 60; // links last 1 hour
