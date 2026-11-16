'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useVisiblePolling } from '@/lib/useVisiblePolling';

type Audit={id:number;created_at:string;actor_kind:string;entity:string;operation:string;subject_id:string|null;before_values:unknown;after_values:unknown};
type Overview={audit:Audit[];recent_signups:number;administrator_count:number;profiles:number;unconfirmed_accounts:number};
export default function SecurityDashboard(){
 const supabase=createClient();const[data,setData]=useState<Overview|null>(null);const[message,setMessage]=useState('Checking administrator access...');
 useVisiblePolling(async()=>{
  const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage('Sign in with an administrator account to continue.');return;}
  const {data:status,error:statusError}=await supabase.rpc('account_security_status');
  if(statusError){setMessage('Security settings could not load. Retrying shortly.');throw statusError;}
  if(!status.administrator){setData(null);setMessage('This account does not have administrator access.');return;}
  if(!status.verified_session){setData(null);setMessage('Verify your authenticator to open the security dashboard.');return;}
  const {data:overview,error}=await supabase.rpc('security_overview');
  if(error){setData(null);setMessage('Security information could not load. Verify your authenticator and try again.');throw error;}
  setData(overview);setMessage('');
 },30000);
 return <main className="min-h-screen bg-[#f6efe8] text-[#3d2b1f] p-5"><section className="max-w-4xl mx-auto"><Link href="/auth/security" className="underline">Account security</Link><h1 className="text-3xl font-bold mt-5">Security dashboard</h1>
 {message&&<p role="status" className="bg-white rounded-xl p-4 mt-5">{message}</p>}
 {data&&<>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">{[['Accounts',data.profiles],['Administrators',data.administrator_count],['Signups in last hour',data.recent_signups],['Unconfirmed accounts',data.unconfirmed_accounts]].map(([label,value])=><div key={label} className="bg-white p-4 rounded-xl"><div className="text-sm">{label}</div><div className="text-2xl font-bold mt-2">{value}</div></div>)}</div>
 {data.recent_signups>20&&<p role="alert" className="bg-amber-100 rounded-xl p-4 my-4">Signup activity is elevated. Review your authentication and firewall logs for unusual activity.</p>}
 <h2 className="text-xl font-semibold">Administrative audit trail</h2><p className="text-sm mt-2">Latest 100 administrative or maintenance changes. Ordinary gameplay is excluded. Secrets and message contents are excluded.</p>
 <div className="space-y-3 mt-5">{data.audit.length?data.audit.map(entry=><article key={entry.id} className="bg-white rounded-xl p-4"><div className="font-semibold">{entry.operation} - {entry.entity}</div><div className="text-sm mt-1">{new Date(entry.created_at).toLocaleString()} - {entry.actor_kind}</div><div className="text-xs break-all mt-2">Account: {entry.subject_id||'Unknown'}</div><details className="mt-3"><summary>View change</summary><pre className="text-xs whitespace-pre-wrap break-all mt-2">{JSON.stringify({before:entry.before_values,after:entry.after_values},null,2)}</pre></details></article>):<p className="bg-white p-4 rounded-xl">No administrative changes recorded yet.</p>}</div>
 </>}
 </section></main>;
}
