import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export function SettingsPage() {
  const [supabaseUser, setSupabaseUser] = useState<any | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let cancelled = false;

    const loadSession = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!cancelled && data.session?.user) {
          setSupabaseUser(data.session.user);
        }
      } catch {
        // ignore
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setSupabaseUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const supabaseConfigured = Boolean(supabase);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    const client = supabase;
    if (!client) {
      setAuthMessage('Cloud login is not configured on this build.');
      return;
    }
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthMessage('Enter email and password.');
      return;
    }
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (authMode === 'signin') {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          setAuthMessage(error.message);
          return;
        }
        if (data.user) {
          setSupabaseUser(data.user);
          setAuthMessage('Signed in successfully.');
        }
      } else {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) {
          setAuthMessage(error.message);
          return;
        }
        if (data.user) {
          setSupabaseUser(data.user);
          setAuthMessage('Account created and signed in.');
        } else {
          setAuthMessage('Check your email to confirm your account.');
        }
      }
    } catch (err: any) {
      setAuthMessage(typeof err?.message === 'string' ? err.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    const client = supabase;
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/settings` : undefined,
        },
      });
      if (error) {
        setAuthMessage(error.message);
      }
    } catch (err: any) {
      setAuthMessage(
        typeof err?.message === 'string' ? err.message : 'Google sign-in failed.',
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    const client = supabase;
    if (!client) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await client.auth.signOut();
      setSupabaseUser(null);
      setAuthMessage('Signed out.');
    } catch (err: any) {
      setAuthMessage(typeof err?.message === 'string' ? err.message : 'Sign out failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <section className="profile">
      <h2 className="page-title">Settings</h2>
      <p className="section-subtitle" style={{ marginBottom: '1rem' }}>
        Manage your account and app preferences.
      </p>

      {supabaseConfigured && (
        <div className="result-card" style={{ marginBottom: '1rem' }}>

          {!supabaseUser && (
            <>
              <p style={{ color: '#6b7280', marginBottom: '0.75rem', textAlign: 'center' }}>
                {authMode === 'signin'
                  ? 'Sign in to sync your swings across devices.'
                  : 'Create a demo account to save your swings in the cloud.'}
              </p>
              <form
                onSubmit={handleAuthSubmit}
                style={{
                  maxWidth: 360,
                  margin: '0 auto',
                }}
              >
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Email</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      padding: '0.45rem 0.6rem',
                      borderRadius: '999px',
                      border: '1px solid rgba(148,163,184,0.7)',
                      width: '100%',
                    }}
                    required
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Password</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      padding: '0.45rem 0.6rem',
                      borderRadius: '999px',
                      border: '1px solid rgba(148,163,184,0.7)',
                      width: '100%',
                    }}
                    required
                  />
                </div>
                {authMessage && (
                  <p style={{ fontSize: '0.85rem', color: '#b91c1c', marginBottom: '0.5rem' }}>{authMessage}</p>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={authBusy}
                  style={{ width: '100%', marginTop: '0.25rem' }}
                >
                  {authMode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
              <div
                style={{
                  margin: '0.75rem 0',
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#9ca3af',
                }}
              >
                <span>OR</span>
              </div>
              <div style={{ maxWidth: 360, margin: '0 auto' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={authBusy}
                  style={{ width: '100%' }}
                  onClick={handleGoogleSignIn}
                >
                  Continue with Google
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                {authMode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4f46e5',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {authMode === 'signin' ? 'Create one' : 'Sign in instead'}
                </button>
              </div>
            </>
          )}
          {supabaseUser && (
            <>
              <p style={{ color: '#6b7280', marginBottom: '0.4rem' }}>
                Signed in as <strong>{supabaseUser.email || supabaseUser.id}</strong>.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSignOut}
                disabled={authBusy}
              >
                Sign out
              </button>
              {authMessage && (
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.4rem' }}>
                  {authMessage}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="result-card">
        <h3>Profile & training</h3>
        <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
          Edit your display name, handedness, play style, and training goals, and view detailed AI
          analytics on your profile page.
        </p>
        <Link to="/profile" className="btn btn-secondary">
          Open profile
        </Link>
      </div>
    </section>
  );
}
