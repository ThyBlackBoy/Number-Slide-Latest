"use client";
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Award, Lock, Check } from 'lucide-react';
type Badge = { id: string; title: string; description: string; metric: string; threshold: number };
export default function Achievements({ userId }: { userId: string }) {
 const [catalog,setCatalog]=useState<Badge[]>([]);
 const [earned,setEarned]=useState<string[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [note,setNote]=useState('');
 const db=createClient();
 useEffect(()=>{ let active=true;
 const load=async()=>{
 const [c,e,i]=await Promise.all([
 db.from('achievement_catalog').select('*').order('threshold'),
 db.from('player_achievements').select('achievement_id').eq('user_id',userId),
 db.from('player_identity').select('achievement_id').eq('user_id',userId).maybeSingle()]);
 if(!active)return;
 if(c.error||e.error||i.error)setNote('Achievements could not load. Please refresh to try again.');
 else {setCatalog(c.data||[]);setEarned((e.data||[]).map(x=>x.achievement_id));setSelected(i.data?.achievement_id||null);}
 setLoading(false);
 };void load();return()=>{active=false;};},[db,userId]);
 const equip=async(id:string|null)=>{setBusy(true);setNote('');
 try { const {error}=await db.rpc('equip_achievement',{badge_id:id});
 if(error)setNote('Could not save your title. Please try again.');
 else {setSelected(id);setNote(id?'Title and badge saved to your player identity.':'Featured title removed.');}
 } catch {setNote('Connection lost. Please try again.');} finally {setBusy(false);} };
 return <section className="mt-8" aria-labelledby="achievement-title">
 <div className="rounded-3xl bg-[#3d2b1f] text-white p-5">
 <div className="flex items-center gap-2 text-amber-300"><Award size={22}/><h2 id="achievement-title" className="text-lg font-bold">Your trophy cabinet</h2></div>
 <p className="mt-2 text-sm text-white/80">{loading?'Loading achievements?':`${earned.length} / ${catalog.length} unlocked`}</p>
 <p className="mt-3 text-xl font-extrabold">{catalog.find(x=>x.id===selected)?.title||'Choose your player title'}</p>
 <p className="mt-2 text-xs text-white/80">Equip an earned badge to show its title on the leaderboard. Unlocks stay with your account.</p>
 </div>
 {note&&<p role="status" className="my-3 text-sm text-[#6b5344]">{note}</p>}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
 {catalog.map(b=>{const unlocked=earned.includes(b.id);const equipped=selected===b.id;
 return <button key={b.id} type="button" disabled={!unlocked||busy} aria-pressed={equipped} onClick={()=>equip(b.id)}
 className={`text-left rounded-2xl border p-4 min-h-32 ${equipped?'border-amber-600 bg-amber-50':unlocked?'border-[#ddc8b8] bg-[#fffaf7]':'border-stone-200 bg-stone-100 text-stone-600'}`}>
 <span className="flex items-center gap-2 font-bold">{equipped?<Check size={18}/>:unlocked?<Award size={18}/>:<Lock size={18}/>} {b.title}</span>
 <span className="block text-xs mt-2">{b.description}</span>
 <span className="block text-xs font-semibold mt-3">{equipped?'Equipped':unlocked?'Unlocked ? tap to equip':'Locked ? keep playing'}</span>
 </button>;})}</div>
 {selected&&<button type="button" disabled={busy} onClick={()=>equip(null)} className="mt-3 min-h-11 text-sm underline">Remove featured title</button>}
 <p className="mt-3 text-xs text-[#6b5344]">Achievements use scores and tiles saved while signed in. Earlier recorded progress counts too.</p>
 </section>;
}
