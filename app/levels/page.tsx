'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { getTargetScore, getLevelTitle } from '@/lib/levels';
import Link from 'next/link';
import { Check, Lock, X } from 'lucide-react';

export default function LevelsPage() {
  const [playerLevel, setPlayerLevel] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('level').eq('id', user.id).single();
        if (data?.level) setPlayerLevel(data.level);
      }
    };
    load();
  }, [supabase]);

  const totalShow = Math.min(playerLevel + 12, 50);
  const levels = Array.from({ length: totalShow }, (_, i) => i + 1);

  const bgNumbers = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#1a1410]">
      {/* Dark warm base with dramatic lighting */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#2a1f1a] via-[#3d2b1f] to-[#1f1612]" />

      {/* Large faded number background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {bgNumbers.map((num, i) => (
          <div
            key={i}
            className="absolute font-black text-white/[0.035] leading-none"
            style={{
              fontSize: `${8 + (i % 5) * 4}rem`,
              left: `${(i * 17) % 90}%`,
              top: `${(i * 23) % 85}%`,
              transform: `rotate(${(i * 17) % 40 - 20}deg)`,
            }}
          >
            {num}
          </div>
        ))}
      </div>

      {/* Warm glow accents */}
      <div className="absolute inset-0 opacity-70 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-64 bg-amber-600/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-orange-700/15 blur-3xl" />
      </div>

      <div className="relative max-w-md mx-auto p-4">
        <Link href="/" className="text-sm font-medium text-white/70 hover:text-white">
          ← Back
        </Link>

        <div className="text-center mt-6 mb-10">
          <h1 className="text-3xl font-extrabold text-white">Merge Trail</h1>
          <p className="text-sm text-white/60 mt-1">Level {playerLevel} · {getLevelTitle(playerLevel)}</p>
        </div>

        <div className="relative">
          {/* Soft path */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <path
              d="M 50% 0 Q 25% 18% 50% 36% T 50% 72% T 50% 100%"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="42"
              strokeLinecap="round"
            />
          </svg>

          <div className="relative space-y-10 py-6" style={{ zIndex: 1 }}>
            {levels.map((lvl, idx) => {
              const isCompleted = lvl < playerLevel;
              const isCurrent = lvl === playerLevel;
              const isLocked = lvl > playerLevel;

              return (
                <div key={lvl} className={`flex ${idx % 2 === 0 ? 'justify-start pl-6' : 'justify-end pr-6'}`}>
                  <button
                    onClick={() => setSelected(lvl)}
                    className="focus:outline-none active:scale-95 transition-transform"
                  >
                    <div
                      className={`
                        relative w-[4.5rem] h-[4.5rem] rounded-3xl flex flex-col items-center justify-center shadow-2xl
                        ${isCompleted
                          ? 'bg-gradient-to-br from-amber-200 to-amber-400 text-[#3d2b1f] border border-amber-300/50'
                          : isCurrent
                          ? 'bg-white text-[#3d2b1f] border-2 border-amber-300 ring-4 ring-amber-400/40'
                          : 'bg-white/10 text-white/40 border border-white/10 backdrop-blur-sm'}
                      `}
                    >
                      {isCompleted && (
                        <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                      {isLocked && (
                        <Lock size={16} className="mb-0.5 opacity-50" />
                      )}
                      <span className="font-bold text-xl leading-none">{lvl}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold mt-1 tracking-wide text-amber-700">PLAY</span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-white/40">
          Tap a level to see details
        </div>
      </div>

      {/* Details panel */}
      {selected !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#2a1f1a] border border-white/10 rounded-3xl p-6 w-full max-w-xs shadow-2xl text-white">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-sm text-white/50">Level</div>
                <div className="text-3xl font-extrabold">{selected}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 text-white/40">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">Title</span>
                <span className="font-semibold">{getLevelTitle(selected)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Target score</span>
                <span className="font-semibold">{getTargetScore(selected).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Status</span>
                <span className={`font-semibold ${
                  selected < playerLevel ? 'text-emerald-400' :
                  selected === playerLevel ? 'text-amber-300' :
                  'text-white/30'
                }`}>
                  {selected < playerLevel ? 'Completed' : selected === playerLevel ? 'Current' : 'Locked'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full mt-6 py-3 bg-amber-400 text-[#3d2b1f] rounded-2xl font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}