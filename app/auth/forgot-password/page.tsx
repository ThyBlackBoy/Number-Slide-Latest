'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
      setMessage(error ? 'The request could not be completed. Please try again shortly.' : 'If an account matches that email, a password reset link will arrive shortly.');
    } catch { setMessage('The request could not be completed. Please try again shortly.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f6efe8] flex items-center justify-center p-4"><section className="bg-white p-8 rounded-2xl w-full max-w-md">
    <h1 className="text-2xl font-bold text-[#3d2b1f]">Reset your password</h1>
    <form onSubmit={submit} className="space-y-4 mt-5"><label className="block">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full border rounded-xl p-3 mt-2" /></label>
    <button disabled={busy} className="w-full rounded-xl bg-[#4a3728] text-white p-3 disabled:opacity-50">{busy?'Sending...':'Send reset link'}</button></form>
    {message&&<p role="status" className="mt-4 text-sm">{message}</p>}<Link href="/auth/login" className="block mt-5 underline">Back to sign in</Link>
  </section></main>;
}
