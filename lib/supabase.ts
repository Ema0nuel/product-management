import { createClient } from "@supabase/supabase-js";

// Supabase client for the JS SDK. The relational data access layer is Prisma
// on the Supabase-hosted PostgreSQL database (PRODUCT.md stack decision).
// This client is available for Supabase platform features (auth, storage)
// if they are adopted later; the env vars are optional placeholders.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;