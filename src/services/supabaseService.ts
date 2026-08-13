/**
 * Supabase client + auth helpers for LetsHunt.
 *
 * Everything goes through this module so the rest of the app never imports
 * @supabase/supabase-js directly. If the env vars are missing the app runs
 * in the legacy local-only mode: `supabase` is null and every auth/club
 * function degrades gracefully.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Current signed-in user, or null (also null when Supabase isn't configured). */
export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Subscribe to auth changes. Returns an unsubscribe function. */
export function onAuthStateChange(
  cb: (user: User | null) => void
): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * The URL a user returns to after confirming an email or clicking a magic
 * link. Derived from the current page so it's correct on both the deployed
 * site and localhost — Supabase's default (localhost:3000) is never right.
 */
function emailRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/** Create a new account (email + password). */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { user: null, error: 'Supabase is not configured.' };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: emailRedirectUrl() },
  });
  if (error) return { user: null, error: error.message };
  return { user: data.user ?? null, error: null };
}

/** Sign in with email + password. */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { user: null, error: 'Supabase is not configured.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user ?? null, error: null };
}

/** Send a magic-link email. Returns success/error; user confirms in their inbox. */
export async function signInWithMagicLink(email: string): Promise<{ sent: boolean; error: string | null }> {
  if (!supabase) return { sent: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: emailRedirectUrl() },
  });
  if (error) return { sent: false, error: error.message };
  return { sent: true, error: null };
}

/** Sign out on this device. */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** The user's email for display, if known. */
export function userEmail(user: User | null): string {
  return user?.email ?? '';
}
