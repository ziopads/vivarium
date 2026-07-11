'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';

export default function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  // Surface an error passed back from the callback (e.g. not on the allowlist).
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err === 'notallowed') setMsg('That email isn’t on the invite list.');
    else if (err) setMsg('Sign-in failed. Please try again.');
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMsg('');
    const supabase = createBrowserSupabase();
    const next = new URLSearchParams(window.location.search).get('next') || '/';
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setStatus('error');
      setMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-2xl">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Enter your email and we’ll send you a one-time sign-in link.
      </p>

      {status === 'sent' ? (
        <p className="mt-6 rounded-md border border-moss/40 bg-moss/5 p-4 text-sm">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={send} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-md border border-line bg-card px-3 py-2 outline-none focus:border-rust"
          />
          <button
            disabled={status === 'sending'}
            className="rounded-md bg-rust px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>
          {msg && <p className="text-sm text-rust">{msg}</p>}
        </form>
      )}
    </div>
  );
}
