'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Factor = { id: string; friendly_name?: string; status: string };

export default function SecurityPage() {
  const supabase = createClient();
  const router = useRouter();
  const [factors,setFactors]=useState<Factor[]>([]);
  const [setup,setSetup]=useState<{id:string;qr:string}|null>(null);
  const [code,setCode]=useState('');
  const [aal2,setAal2]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [administrator,setAdministrator]=useState(false);
  const [message,setMessage]=useState('');

  async function refresh() {
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace('/auth/login');return;}
    const [list,assurance]=await Promise.all([supabase.auth.mfa.listFactors(),supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
    if(list.error||assurance.error)throw new Error('Could not load account security. Please try again.');
    const {data:status}=await supabase.rpc('account_security_status');
    setAdministrator(!!status?.administrator);
    setFactors(list.data.totp);setAal2(assurance.data.currentLevel==='aal2');setLoading(false);
  }
  useEffect(()=>{void refresh().catch(()=>{setMessage('Could not load account security. Refresh to retry.');setLoading(false);});},[supabase]);
  const verified=factors.filter(f=>f.status==='verified');

  async function enroll() {
    setBusy(true);setMessage('');
    try {
      const {data:existing,error:factorError}=await supabase.auth.mfa.listFactors();
      if(factorError)throw factorError;
      for(const factor of existing.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')) {
        const {error}=await supabase.auth.mfa.unenroll({factorId:factor.id});if(error)throw error;
      }
      const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:`Number Slide ${new Date().toISOString().slice(0,10)}`});
      if(error)throw error;
      const qr=data.totp.qr_code.startsWith('data:')?data.totp.qr_code:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.totp.qr_code)}`;
      setSetup({id:data.id,qr});setCode('');
    } catch {setMessage('Could not start authenticator setup. Please try again.');}
    finally{setBusy(false);}
  }
  async function verify(event:React.FormEvent) {
    event.preventDefault();const factorId=setup?.id||verified[0]?.id;
    if(!factorId||!/^\d{6}$/.test(code)){setMessage('Enter the current six-digit authenticator code.');return;}
    setBusy(true);setMessage('');
    try {
      const {error}=await supabase.auth.mfa.challengeAndVerify({factorId,code});
      if(error)throw error;
      setSetup(null);setCode('');await refresh();setMessage('Authenticator verified. Your current session has two-factor protection.');router.refresh();
    } catch {setMessage('That code could not be verified. Use the newest code and try again.');}
    finally{setBusy(false);}
  }
  async function remove(factorId:string) {
    if(administrator&&verified.some(f=>f.id===factorId)&&verified.length===1){setMessage('Administrators must keep an authenticator. Add a replacement before removing this one.');return;}
    setBusy(true);setMessage('');
    try {
      const {error}=await supabase.auth.mfa.unenroll({factorId});if(error)throw error;
      setSetup(null);setCode('');await refresh();setMessage('Authenticator removed.');
    } catch {setMessage('Could not remove the authenticator. Verify your current code first.');}
    finally{setBusy(false);}
  }
  return <main className="min-h-screen bg-[#f6efe8] p-5 text-[#3d2b1f]"><section className="max-w-lg mx-auto bg-white rounded-2xl p-6 mt-5">
    <Link href="/profile" className="text-sm underline">Back to profile</Link><h1 className="text-2xl font-bold mt-5">Account security</h1>
    {loading?<p className="mt-5">Loading security settings...</p>:<>
      <h2 className="text-lg font-semibold mt-6">Two-factor authentication</h2>
      <p className="text-sm mt-2">An authenticator app adds a code to your password. Keep access to that app: you will need it when signing in.</p>
      {!setup&&verified.length===0&&<button disabled={busy} onClick={enroll} className="mt-4 rounded-xl bg-[#4a3728] text-white p-3 disabled:opacity-50">Set up authenticator</button>}
      {setup&&<div className="mt-4"><p>Scan this QR code with your authenticator app. Keep this setup code private.</p><img src={setup.qr} alt="Authenticator setup QR code" width={240} height={240} className="my-4 max-w-full"/></div>}
      {(setup||(verified.length>0&&!aal2))&&<form onSubmit={verify} className="mt-5 space-y-3"><label className="block">Authenticator code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required aria-label="Authenticator code" className="block border rounded-xl p-3 w-full mt-2"/></label><button disabled={busy} className="bg-[#4a3728] text-white rounded-xl p-3 disabled:opacity-50">{busy?'Verifying...':'Verify code'}</button></form>}
      {verified.length>0&&aal2&&<p className="mt-4 font-semibold text-green-800">Two-factor authentication is verified for this session.</p>}
      {setup&&<button disabled={busy} onClick={()=>remove(setup.id)} className="mt-4 underline">Cancel setup</button>}
      {verified.map(f=><div key={f.id} className="border-t mt-5 pt-4"><p className="text-sm">{f.friendly_name||'Authenticator app'}</p><button disabled={busy||!aal2} onClick={()=>remove(f.id)} className="mt-2 underline disabled:opacity-50">Remove authenticator</button></div>)}
      <p className="mt-6 text-sm">For a lost authenticator, contact the game administrator for identity verification. Never send anyone your password or authenticator code.</p>
      {administrator&&aal2&&<Link href="/admin/security" className="block mt-4 underline">Open security dashboard</Link>}
      <Link href="/auth/forgot-password" className="block mt-4 underline">Reset your password</Link><Link href="/" className="block mt-4 underline">Continue to game</Link>
    </>}
    {message&&<p role="status" className="mt-4 text-sm">{message}</p>}
  </section></main>;
}
