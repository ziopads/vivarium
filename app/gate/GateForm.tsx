'use client';

import { useState } from 'react';

export default function GateForm({ next }: { next: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Incorrect password.');
        setPassword('');
        return;
      }
      // Full navigation, not client push: the cookie was just set and the
      // destination must be re-fetched through middleware to be admitted.
      window.location.assign(data.redirect || '/');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="Password"
        className="w-full rounded border border-line bg-parchment px-3 py-2 outline-none focus:border-rust"
      />
      {error && <p className="mt-2 text-sm text-rust">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !password}
        className="mt-3 w-full rounded bg-rust px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </div>
  );
}
