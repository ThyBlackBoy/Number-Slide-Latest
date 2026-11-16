'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();setLoading(true);setError('');
    try {
      const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error){setError(error.message);return;}
      const {data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const {data:security,error:securityError}=await supabase.rpc('account_security_status');
      if(assuranceError||securityError){setError('Could not check account security. Please try again.');return;}
      const needsVerification=(security?.administrator&&assurance?.currentLevel!=='aal2')||
        (assurance?.nextLevel==='aal2'&&assurance.currentLevel!=='aal2');
      setPassword('');router.push(needsVerification?'/auth/security':'/');router.refresh();
    } catch {setError('Could not sign in. Please try again shortly.');}
    finally {setLoading(false);}
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8d5c8] to-[#e8b4a8] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-6 text-[#3d2b1f]">Welcome back</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" required className="w-full px-4 py-3 rounded-xl border border-[#ead8cc] outline-none" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required className="w-full px-4 py-3 rounded-xl border border-[#ead8cc] outline-none" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={loading} className="w-full bg-[#4a3728] text-white font-semibold py-3 rounded-xl disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="text-center mt-4"><Link href="/auth/forgot-password" className="text-sm font-semibold text-[#3d2b1f]">Forgot your password?</Link></p>
        <p className="text-center mt-6 text-[#6b5344]">
          No account? <Link href="/auth/signup" className="font-semibold text-[#3d2b1f]">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
