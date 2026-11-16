'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { passwordError } from '@/lib/accountSecurity';

export default function ResetPasswordPage() {
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{void createClient().auth.getUser().then(({data})=>setReady(!!data.user));},[]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();const problem=passwordError(password);if(problem){setMessage(problem);return;}
    if(password!==confirmation){setMessage('Passwords do not match.');return;}setBusy(true);
    try {const {error}=await createClient().auth.updateUser({password});if(error){setMessage('Could not update your password. Reopen the reset link or try again.');return;}
      setPassword('');setConfirmation('');setMessage('Password updated. Sign in with your new password.');await createClient().auth.signOut();setReady(false);
    } catch {setMessage('Could not update your password. Please try again.');}finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-[#f6efe8] flex items-center justify-center p-4"><section className="bg-white p-8 rounded-2xl w-full max-w-md"><h1 className="text-2xl font-bold">Choose a new password</h1>
    {ready?<form onSubmit={submit} className="space-y-4 mt-5"><label className="block">New password<input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} className="block border rounded-xl p-3 w-full mt-2"/></label>
    <label className="block">Confirm password<input type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="block border rounded-xl p-3 w-full mt-2"/></label>
    <button disabled={busy} className="rounded-xl bg-[#4a3728] text-white p-3 w-full disabled:opacity-50">{busy?'Updating...':'Update password'}</button></form>:<p className="mt-4">Use the password reset link from your email to open this page.</p>}
    {message&&<p role="status" className="mt-4 text-sm">{message}</p>}<Link href="/auth/login" className="block mt-5 underline">Sign in</Link>
  </section></main>;
}
