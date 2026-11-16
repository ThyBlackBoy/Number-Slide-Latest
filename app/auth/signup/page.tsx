'use client';

import { useState } from 'react';
import { passwordError, validUsername } from '@/lib/accountSecurity';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();setError('');setMessage('');
    const problem=passwordError(password);
    if(problem){setError(problem);return;}
    if(!validUsername(username.trim())){setError('Username must be 3-24 letters, numbers or underscores.');return;}
    setLoading(true);
    try {
      const {data,error}=await supabase.auth.signUp({email:email.trim(),password,
        options:{data:{username:username.trim()},emailRedirectTo:`${window.location.origin}/auth/callback`}});
      if(error){setError(error.message);return;}
      setPassword('');
      if(data.session){router.push('/');router.refresh();}
      else setMessage('Check your email to confirm your account before signing in.');
    } catch {setError('Could not create your account. Please try again shortly.');}
    finally {setLoading(false);}
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6 text-[#3d2b1f]">Create account</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required minLength={3} maxLength={24} autoComplete="username" className="w-full px-4 py-3 rounded-xl border border-[#ead8cc] outline-none" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" required className="w-full px-4 py-3 rounded-xl border border-[#ead8cc] outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={12} autoComplete="new-password" className="w-full px-4 py-3 rounded-xl border border-[#ead8cc] outline-none" />
          {message && <p role="status" className="text-green-800 text-sm">{message}</p>}
          <p className="text-xs text-[#6b5344]">Use a unique password with at least 12 characters.</p>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={loading} className="w-full bg-[#4a3728] text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <p className="text-center mt-6 text-[#6b5344]">
          Already playing? <Link href="/auth/login" className="font-semibold text-[#3d2b1f]">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
