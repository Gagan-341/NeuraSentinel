import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://obbfjshgamtbhiqsmdtx.supabase.co';
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iYmZqc2hnYW10YmhpcXNtZHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMzcyMjMsImV4cCI6MjA3ODkxMzIyM30.X7c9yyk_PJM8yFVKUGHEoSgwRjYxDjprmLTk1g4lwJA';

const envConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!envConfigured) {
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars missing – using default demo credentials for auth.');
}

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
