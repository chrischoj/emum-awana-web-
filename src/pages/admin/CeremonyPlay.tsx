import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadConfirmedCeremony, loadConfirmedCeremonyLocal } from '../../services/ceremonyService';
import type { AwardsData } from '../../types/awana';

// ─── Responsive ───
function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function getResponsive(width: number) {
  const isMobile = width < 768;
  const isLarge = width >= 1200;
  const isXL = width >= 1600;
  return {
    contentMax: isXL ? 1400 : isLarge ? 1200 : isMobile ? '100%' : 720,
    pad: isMobile ? 16 : isLarge ? 48 : 24,
    padY: isMobile ? 12 : isLarge ? 32 : 20,
    titleFs: isXL ? '5rem' : isLarge ? '4.2rem' : isMobile ? '1.6rem' : '2.8rem',
    h2Fs: isXL ? '4.2rem' : isLarge ? '3.6rem' : isMobile ? '1.7rem' : '2.6rem',
    bodyFs: isXL ? '1.6rem' : isLarge ? '1.4rem' : isMobile ? '0.8rem' : '0.95rem',
    smallFs: isXL ? '1.2rem' : isLarge ? '1.1rem' : isMobile ? '0.7rem' : '0.85rem',
    barHeight: isXL ? 400 : isLarge ? 340 : isMobile ? 160 : 220,
    barMaxW: isXL ? 220 : isLarge ? 180 : isMobile ? 72 : 120,
    barLabelFs: isXL ? '2.4rem' : isLarge ? '2rem' : isMobile ? '1rem' : '1.4rem',
    barNumFs: isXL ? '2.4rem' : isLarge ? '2rem' : isMobile ? '0.95rem' : '1.1rem',
    grandTrophy: isXL ? 160 : isLarge ? 130 : isMobile ? 80 : 100,
    grandTeamFs: isXL ? '6rem' : isLarge ? '5rem' : isMobile ? '2.5rem' : '3.8rem',
    grandScoreFs: isXL ? '3.2rem' : isLarge ? '2.8rem' : isMobile ? '1.5rem' : '2.2rem',
    eeumH: isXL ? 90 : isLarge ? 76 : isMobile ? 40 : 52,
    awanaBottomH: isXL ? 160 : isLarge ? 140 : isMobile ? 72 : 112,
    iconH: isXL ? 90 : isLarge ? 76 : isMobile ? 44 : 58,
    gap: isMobile ? 8 : isXL ? 28 : isLarge ? 20 : 12,
  };
}

// ─── Constants ───
const TEAMS = ['RED', 'BLUE', 'GREEN', 'YELLOW'] as const;
type Team = (typeof TEAMS)[number];

const TEAM_COLORS: Record<Team, { bg: string; light: string; mid: string; dark: string; glow: string }> = {
  RED: { bg: '#DC2626', light: '#FEE2E2', mid: '#F87171', dark: '#991B1B', glow: 'rgba(220,38,38,0.4)' },
  BLUE: { bg: '#2563EB', light: '#DBEAFE', mid: '#60A5FA', dark: '#1E3A8A', glow: 'rgba(37,99,235,0.4)' },
  GREEN: { bg: '#16A34A', light: '#DCFCE7', mid: '#4ADE80', dark: '#14532D', glow: 'rgba(22,163,74,0.4)' },
  YELLOW: { bg: '#EAB308', light: '#FEF9C3', mid: '#FACC15', dark: '#713F12', glow: 'rgba(234,179,8,0.4)' },
};

// ─── Sound Effects ───
const SFX = {
  _cache: {} as Record<string, HTMLAudioElement>,
  _bgmAudio: null as HTMLAudioElement | null,
  _bgmVol: 0.20,
  _bgmPlaying: false,
  _ducked: false,
  _ctx: null as AudioContext | null,
  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  },
  _play(url: string, volume = 1) {
    try {
      const audio = new Audio(url);
      audio.volume = Math.min(volume, 1);
      audio.play().catch(() => {});
      return audio;
    } catch { /* ignore */ }
  },
  preload() {
    ['/sfx/whoosh.mp3', '/sfx/scale.mp3', '/sfx/bling.mp3', '/sfx/chime.mp3',
     '/sfx/fanfare1.mp3', '/sfx/fanfare2.mp3', '/sfx/cannon.mp3', '/sfx/cannon2.mp3',
     '/sfx/slide.mp3', '/sfx/jingle1.mp3'].forEach(url => {
      const a = new Audio(); a.preload = 'auto'; a.src = url;
      this._cache[url] = a;
    });
  },
  whoosh() { this._play('/sfx/whoosh.mp3', 0.3); },
  countUp() { setTimeout(() => this._play('/sfx/scale.mp3', 0.25), 200); },
  ding() { setTimeout(() => this._play('/sfx/bling.mp3', 0.35), 800); },
  drumroll(duration = 2.5) {
    try {
      const ctx = this._getCtx();
      const sr = ctx.sampleRate;
      const len = sr * duration;
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const hps = 40;
      for (let t = 0; t < duration; t += 1 / hps) {
        const progress = t / duration;
        const rate = 1 + progress * 2;
        const offset = Math.floor(t * sr / rate * rate);
        if (offset >= len) break;
        const vol = 0.04 + progress * 0.12;
        for (let j = 0; j < 600 && offset + j < len; j++) {
          const noise = (Math.random() * 2 - 1) * vol * Math.exp(-j / 60);
          const tone = Math.sin(j * 0.15) * vol * 0.5 * Math.exp(-j / 40);
          d[offset + j] += noise + tone;
        }
      }
      const finalHits = 20;
      for (let i = 0; i < finalHits; i++) {
        const offset = Math.floor((duration - 0.3 + i * 0.015) * sr);
        if (offset >= len || offset < 0) continue;
        for (let j = 0; j < 800 && offset + j < len; j++) {
          d[offset + j] += (Math.random() * 2 - 1) * 0.18 * Math.exp(-j / 50);
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + duration * 0.8);
      gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + duration);
      src.connect(gain).connect(ctx.destination);
      src.start();
      return src;
    } catch { /* ignore */ }
  },
  fanfare() {
    this._play('/sfx/u_ss015dykrt-brass-fanfare-with-timpani-and-winchimes-reverberated-146260.mp3', 0.45);
    setTimeout(() => this._play('/sfx/cannon.mp3', 0.35), 200);
    setTimeout(() => this._play('/sfx/cannon2.mp3', 0.3), 600);
  },
  celebrate() {
    setTimeout(() => this._play('/sfx/bling.mp3', 0.3), 0);
    setTimeout(() => this._play('/sfx/jingle1.mp3', 0.25), 500);
    setTimeout(() => this._play('/sfx/chime.mp3', 0.2), 1000);
  },
  startBGM() {
    try {
      if (this._bgmAudio) { this._bgmAudio.play().catch(() => {}); this._bgmPlaying = true; return; }
      const audio = new Audio('/bgm/mfcc-award-awards-ceremony-music-406442.mp3');
      audio.loop = true;
      audio.volume = this._bgmVol;
      audio.play().catch(() => {});
      this._bgmAudio = audio;
      this._bgmPlaying = true;
    } catch { /* ignore */ }
  },
  stopBGM() {
    try { if (this._bgmAudio) { this._bgmAudio.pause(); this._bgmPlaying = false; } } catch { /* ignore */ }
  },
  resetBGM() {
    try { if (this._bgmAudio) { this._bgmAudio.pause(); this._bgmAudio.currentTime = 0; } } catch { /* ignore */ }
    this._bgmAudio = null;
    this._bgmPlaying = false;
    this._ducked = false;
  },
  toggleBGM() { if (this._bgmPlaying) this.stopBGM(); else this.startBGM(); return this._bgmPlaying; },
  setBGMVolume(vol: number) { this._bgmVol = vol; if (this._bgmAudio && !this._ducked) this._bgmAudio.volume = vol; },
  getBGMVolume() { return this._bgmVol; },
  isBGMPlaying() { return this._bgmPlaying; },
  duckBGM(duration = 3000) {
    try {
      if (this._bgmAudio) {
        this._ducked = true;
        this._bgmAudio.volume = this._bgmVol;
        setTimeout(() => { if (this._bgmAudio) this._bgmAudio.volume = this._bgmVol; this._ducked = false; }, duration);
      }
    } catch { /* ignore */ }
  },
  switchToOscarBGM() {
    try {
      if (this._bgmAudio) { this._bgmAudio.pause(); this._bgmAudio.currentTime = 0; }
      const oscar = new Audio('/bgm/20260316-final-oscar.mp3');
      oscar.loop = false;
      oscar.currentTime = 7;
      oscar.volume = this._bgmVol;
      oscar.play().catch(() => {});
      this._bgmAudio = oscar;
      this._bgmPlaying = true;
    } catch { /* ignore */ }
  },
};

// ─── Helpers ───
function calcTotals(data: AwardsData) {
  const hb: Record<string, number> = {};
  const gm: Record<string, number> = {};
  const total: Record<string, number> = {};
  TEAMS.forEach(t => {
    hb[t] = (data.handbook.sparks[t] || 0) + (data.handbook.tnt[t] || 0);
    gm[t] = (data.game.sparks[t] || 0) + (data.game.tnt[t] || 0);
    total[t] = hb[t] + gm[t];
  });
  return { handbook: hb, game: gm, total };
}

function getWinner(scores: Record<string, number>): string | string[] {
  const max = Math.max(...Object.values(scores));
  const winners = Object.keys(scores).filter(t => scores[t] === max);
  return winners.length === 1 ? winners[0] : winners;
}
function isTie(winner: string | string[]): winner is string[] { return Array.isArray(winner); }
function isAllZero(scores: Record<string, number>) { return Object.values(scores).every(s => s === 0); }

// ─── Flow Items ───
const FLOW_ITEMS = [
  { id: 'sparks_handbook', label: 'Sparks Handbook', icon: '/sparks.avif', title: '스팍스 핸드북', dataKey: 'handbook.sparks' },
  { id: 'tnt_handbook', label: 'T&T Handbook', icon: '/tt.png', title: 'T&T 핸드북', dataKey: 'handbook.tnt' },
  { id: 'sparks_game', label: 'Sparks Game', icon: '/sparks.avif', title: '스팍스 게임', dataKey: 'game.sparks' },
  { id: 'tnt_game', label: 'T&T Game', icon: '/tt.png', title: 'T&T 게임', dataKey: 'game.tnt' },
];
const DEFAULT_FLOW_ORDER = ['sparks_handbook', 'tnt_handbook', 'sparks_game', 'tnt_game'];

// ─── Confetti ───
function Confetti({ active, teamColor }: { active: boolean; teamColor: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<any[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const tc = teamColor && TEAM_COLORS[teamColor as Team];
    const colors = tc
      ? [tc.bg, tc.mid, tc.light, '#FFD700', '#FFFFFF']
      : ['#DC2626', '#2563EB', '#16A34A', '#EAB308', '#FFD700', '#FF69B4', '#9333EA'];

    particles.current = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rv: (Math.random() - 0.5) * 8,
      opacity: 1,
    }));

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rv; p.vy += 0.05;
        if (p.y > canvas.height + 50) { p.y = -20; p.x = Math.random() * canvas.width; p.vy = Math.random() * 3 + 2; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      animRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [active, teamColor]);

  if (!active) return null;
  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }} />;
}

// ─── AnimatedNumber ───
function AnimatedNumber({ value, duration = 1500, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const [display, setDisplay] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [started, value, duration]);

  return <span>{display.toLocaleString()}</span>;
}

// ─── BarChart ───
function BarChart({ scores, revealed, chartHeight = 220, barMaxWidth = 120, numberFontSize = '1.1rem' }: {
  scores: Record<string, number>; revealed: boolean; chartHeight?: number; barMaxWidth?: number; numberFontSize?: string;
}) {
  const maxScore = Math.max(...Object.values(scores), 1);
  const winner = getWinner(scores);
  const barInnerHeight = typeof chartHeight === 'number' ? chartHeight - 40 : 180;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'center', height: chartHeight, padding: '0 16px' }}>
        {TEAMS.map((team, i) => {
          const score = scores[team] || 0;
          const height = (score / maxScore) * barInnerHeight;
          const isWinner = isTie(winner) ? winner.includes(team) : team === winner;
          const c = TEAM_COLORS[team];
          return (
            <div key={team} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: barMaxWidth,
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translateY(0)' : 'translateY(40px)',
              transition: `all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.15}s`,
            }}>
              <div style={{
                fontFamily: "'Black Han Sans', sans-serif", fontSize: numberFontSize, fontWeight: 700,
                color: isWinner ? c.bg : '#475569', marginBottom: 8, transition: 'all 0.5s ease',
                textShadow: isWinner ? `0 0 20px ${c.glow}` : 'none',
              }}>
                {revealed ? <AnimatedNumber value={score} delay={i * 150 + 300} /> : 0}
              </div>
              <div style={{
                width: '100%', height: revealed ? height : 0,
                background: isWinner
                  ? `linear-gradient(180deg, ${c.mid}, ${c.bg}, ${c.dark})`
                  : `linear-gradient(180deg, ${c.mid}88, ${c.bg}88)`,
                borderRadius: '12px 12px 4px 4px',
                transition: `height 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.15 + 0.3}s, box-shadow 0.5s ease`,
                boxShadow: isWinner ? `0 0 30px ${c.glow}, 0 4px 20px rgba(0,0,0,0.2)` : '0 4px 12px rgba(0,0,0,0.1)',
                position: 'relative', overflow: 'hidden',
              }}>
                {isWinner && <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 50%)',
                  animation: 'shimmer 2s infinite',
                }} />}
              </div>
              <div style={{
                fontFamily: "'Black Han Sans', sans-serif",
                fontSize: isWinner ? '1.2rem' : '1rem', fontWeight: 700,
                color: isWinner ? c.bg : c.bg + 'CC', marginTop: 10,
                padding: '4px 16px', borderRadius: 20,
                background: isWinner ? c.light : 'transparent',
                border: isWinner ? `2px solid ${c.bg}` : '2px solid transparent',
              }}>{team}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trophy SVG ───
function Trophy({ color, size = 80 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: `drop-shadow(0 4px 12px ${color}66)` }}>
      <defs>
        <linearGradient id={`tg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFA500" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path d="M30 25 H70 V28 C70 28 80 30 82 40 C84 50 75 55 70 50 V55 C70 70 60 75 55 78 L58 85 H42 L45 78 C40 75 30 70 30 55 V50 C25 55 16 50 18 40 C20 30 30 28 30 28 Z"
        fill={`url(#tg-${color})`} stroke="#B8860B" strokeWidth="1.5" />
      <rect x="38" y="85" width="24" height="5" rx="2" fill="#B8860B" />
      <rect x="34" y="90" width="32" height="6" rx="3" fill="#DAA520" />
      <ellipse cx="50" cy="45" rx="12" ry="14" fill="rgba(255,255,255,0.15)" />
      <text x="50" y="50" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#FFF8DC" fontFamily="serif">★</text>
    </svg>
  );
}

// ─── LeaderBadge ───
function LeaderBadge({ scores, r }: { scores: Record<string, number>; r: ReturnType<typeof getResponsive> }) {
  const winner = getWinner(scores);
  const allZero = isAllZero(scores);
  const tied = isTie(winner);

  if (tied || allZero) {
    const teams = allZero ? [...TEAMS] : winner;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8,
        padding: '14px 24px', borderRadius: 20,
        background: 'linear-gradient(135deg, #FFF7ED, white, #FEF3C7)',
        border: '3px solid #F59E0B',
        boxShadow: '0 0 24px rgba(245,158,11,0.3), 0 4px 16px rgba(0,0,0,0.1)',
        animation: 'winnerPop 0.6s ease 0.5s both',
      }}>
        <span style={{ fontSize: '1.2rem', fontFamily: "'Noto Sans KR', sans-serif", fontWeight: 700, color: '#92400E' }}>
          {allZero ? '🤝 모두 함께 시작해요!' : '🤝 공동 1위!'}
        </span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {teams.map(t => {
            const c = TEAM_COLORS[t as Team];
            return (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.h2Fs, color: c.bg, letterSpacing: 2, textShadow: `0 0 12px ${c.glow}` }}>{t}</span>
                <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.bodyFs, color: c.dark, fontWeight: 700, background: c.light, padding: '4px 10px', borderRadius: 8 }}>{(scores[t] || 0).toLocaleString()}점</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const w = winner as string;
  const c = TEAM_COLORS[w as Team];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8,
      padding: '14px 32px', borderRadius: 20,
      background: `linear-gradient(135deg, ${c.light}, white, ${c.light})`,
      border: `3px solid ${c.bg}`,
      boxShadow: `0 0 24px ${c.glow}, 0 4px 16px rgba(0,0,0,0.1)`,
      animation: 'winnerPop 0.6s ease 0.5s both',
    }}>
      <span style={{ fontSize: '1.6rem', animation: 'starSpin 3s linear infinite' }}>⭐</span>
      <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.h2Fs, color: c.bg, letterSpacing: 2, textShadow: `0 0 16px ${c.glow}` }}>{w}</span>
      <span style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.bodyFs, color: c.dark, fontWeight: 700, background: c.light, padding: '4px 12px', borderRadius: 8 }}>{(scores[w] || 0).toLocaleString()}점</span>
    </div>
  );
}

// ─── CSS Keyframes ───
const CEREMONY_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;600;700;900&display=swap');
  @keyframes shimmer { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
  @keyframes winnerPop { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
  @keyframes starSpin { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.2); } 100% { transform: rotate(360deg) scale(1); } }
  @keyframes grandReveal { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 50% { transform: scale(1.15) rotate(5deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
  @keyframes crownBounce { 0%, 100% { transform: translateY(0) rotate(-5deg) scale(1); } 25% { transform: translateY(-14px) rotate(5deg) scale(1.15); } 50% { transform: translateY(-6px) rotate(-3deg) scale(1.05); } 75% { transform: translateY(-10px) rotate(4deg) scale(1.1); } }
  @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.1); } 50% { box-shadow: 0 0 50px rgba(255,215,0,0.6), 0 0 100px rgba(255,215,0,0.3), 0 0 150px rgba(255,215,0,0.1); } }
  @keyframes textShine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes popIn { 0% { transform: scale(0) rotate(-180deg); opacity: 0; } 60% { transform: scale(1.3) rotate(10deg); } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
  @keyframes slideUp { 0% { transform: translateY(60px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
  @keyframes podiumRise { 0% { transform: scaleY(0); } 60% { transform: scaleY(1.1); } 100% { transform: scaleY(1); } }
  @keyframes readyPulse { 0%,100%{box-shadow:0 0 20px rgba(255,215,0,0.3)} 50%{box-shadow:0 0 40px rgba(255,215,0,0.6)} }
`;

// ═══════════════════════════════════════════
// ─── Main CeremonyPlay Component ───
// ═══════════════════════════════════════════
export default function CeremonyPlay() {
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const r = getResponsive(width);

  const [mode, setMode] = useState<'loading' | 'no_data' | 'ready' | 'ceremony'>('loading');
  const [data, setData] = useState<AwardsData | null>(null);
  const [confirmedInfo, setConfirmedInfo] = useState<{ confirmedAt: string; dateFrom: string; dateTo: string } | null>(null);
  const [step, setStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiTeam, setConfettiTeam] = useState<string | null>(null);
  const [bgmPlaying, setBgmPlaying] = useState(true);
  const [bgmVol, setBgmVol] = useState(0.20);
  const flowOrder = DEFAULT_FLOW_ORDER;

  // Load confirmed data: localStorage first (instant), then Supabase (fresh)
  useEffect(() => {
    const local = loadConfirmedCeremonyLocal();
    if (local) {
      setData(local.data);
      setConfirmedInfo({ confirmedAt: local.confirmedAt, dateFrom: local.dateFrom, dateTo: local.dateTo });
      setMode('ready');
    }
    loadConfirmedCeremony().then((confirmed) => {
      if (confirmed) {
        setData(confirmed.data);
        setConfirmedInfo({ confirmedAt: confirmed.confirmedAt, dateFrom: confirmed.dateFrom, dateTo: confirmed.dateTo });
        setMode('ready');
      } else if (!local) {
        setMode('no_data');
      }
    });
  }, []);

  const totals = data ? calcTotals(data) : { handbook: {}, game: {}, total: {} };
  const grandWinner = data ? getWinner(totals.total) : 'RED';
  const grandTied = isTie(grandWinner);
  const grandAllZero = data ? isAllZero(totals.total) : true;
  const grandDisplayTeam = grandTied ? grandWinner[0] : grandWinner;

  const steps = [
    { id: 'title', label: '시작' },
    ...flowOrder.map(id => FLOW_ITEMS.find(f => f.id === id)).filter(Boolean) as typeof FLOW_ITEMS,
    { id: 'grand_buildup', label: '최종 발표' },
    { id: 'grand_winner', label: '최종 시상' },
  ];
  const currentStep = steps[step];

  const nextStep = useCallback(() => {
    if (step < steps.length - 1) {
      setShowConfetti(false); setConfettiTeam(null);
      setTimeout(() => setStep(s => s + 1), 100);
    }
  }, [step, steps.length]);

  const prevStep = useCallback(() => {
    if (step > 0) { setShowConfetti(false); setConfettiTeam(null); setStep(s => s - 1); }
  }, [step]);

  // Confetti on grand winner
  useEffect(() => {
    if (currentStep?.id === 'grand_winner') {
      setTimeout(() => { setShowConfetti(true); setConfettiTeam(grandTied ? grandDisplayTeam : grandWinner as string); }, 500);
    }
  }, [step]);

  // BGM
  useEffect(() => {
    if (mode === 'ceremony') { SFX.preload(); SFX.startBGM(); setBgmPlaying(true); }
    return () => { SFX.resetBGM(); setBgmPlaying(false); };
  }, [mode]);

  // Sound effects on step change
  useEffect(() => {
    if (mode !== 'ceremony' || !currentStep) return;
    const id = currentStep.id;
    if (id === 'title') return;
    if (id === 'grand_buildup') {
      SFX.setBGMVolume(1); setBgmVol(1); SFX.switchToOscarBGM();
      if (SFX._bgmAudio) SFX._bgmAudio.volume = 0.90;
      setTimeout(() => SFX.drumroll(2.5), 500);
    } else if (id === 'grand_winner') {
      if (SFX._bgmAudio) { SFX._bgmAudio.currentTime = 45; SFX._bgmAudio.volume = 1; }
    } else {
      SFX.duckBGM(2500); SFX.whoosh(); SFX.countUp(); SFX.ding();
    }
  }, [step, mode]);

  // Keyboard nav
  useEffect(() => {
    if (mode !== 'ceremony' && mode !== 'ready') return;
    const handler = (e: KeyboardEvent) => {
      if (mode === 'ready') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('ceremony'); setStep(0); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); nextStep(); }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') { e.preventDefault(); prevStep(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, nextStep, prevStep]);

  // ─── Loading ───
  if (mode === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
        <div style={{ color: 'white', fontSize: '1.2rem' }}>로딩 중...</div>
      </div>
    );
  }

  // ─── No Data ───
  if (mode === 'no_data') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a, #1e293b)', fontFamily: "'Noto Sans KR', sans-serif", gap: 24, padding: 32,
      }}>
        <div style={{ fontSize: '3rem' }}>🏆</div>
        <h2 style={{ color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>확정된 시상식 데이터가 없습니다</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
          시상식 준비 페이지에서 점수를 집계하고 확정해주세요.
        </p>
        <button onClick={() => navigate('/admin/ceremony')} style={{
          padding: '12px 32px', background: 'linear-gradient(135deg, #FFD700, #FFA500)',
          border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 700,
          color: '#1a1a2e', cursor: 'pointer',
        }}>시상식 준비로 이동</button>
      </div>
    );
  }

  // ─── Ready ───
  if (mode === 'ready') {
    return (
      <div style={{
        minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a, #1e293b, #334155)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Noto Sans KR', sans-serif", gap: 32, padding: 32,
      }}>
        <style>{CEREMONY_STYLES}</style>
        <div style={{ fontSize: r.titleFs, fontWeight: 900, color: 'white', textAlign: 'center' }}>🏆 AWANA 시상식</div>
        {confirmedInfo && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: r.smallFs, textAlign: 'center' }}>
            기간: {confirmedInfo.dateFrom} ~ {confirmedInfo.dateTo}<br />
            확정: {new Date(confirmedInfo.confirmedAt).toLocaleString('ko-KR')}
          </div>
        )}
        <button onClick={() => { setMode('ceremony'); setStep(0); }} style={{
          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
          border: 'none', borderRadius: 16, padding: '20px 48px',
          fontSize: '1.3rem', fontWeight: 800, color: '#1a1a2e',
          cursor: 'pointer', boxShadow: '0 4px 24px rgba(255,215,0,0.4)',
          animation: 'readyPulse 2s ease-in-out infinite',
        }}>▶ 시상식 시작</button>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: r.smallFs }}>
          버튼 또는 <kbd style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>Enter</kbd> 키를 눌러 시작하세요
        </div>
        <button onClick={() => navigate('/admin/ceremony')} style={{
          padding: '8px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: r.smallFs,
        }}>← 점수 수정하러 가기</button>
      </div>
    );
  }

  if (!data) return null;

  // ─── Ceremony Render ───
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Noto Sans KR', sans-serif",
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{CEREMONY_STYLES}</style>
      <Confetti active={showConfetti} teamColor={confettiTeam} />

      {/* Background */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(circle at 20% 80%, rgba(234,179,8,0.05) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(37,99,235,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: `${r.padY}px ${r.pad}px`,
        background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)', zIndex: 10,
      }}>
        <button onClick={() => { setMode('ready'); setStep(0); setShowConfetti(false); SFX.resetBGM(); }} style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          color: 'white', padding: `${r.padY}px ${r.pad}px`, borderRadius: 8, cursor: 'pointer', fontSize: r.smallFs,
        }}>← 대기화면</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: r.smallFs }}>{step + 1} / {steps.length}</div>
          <button onClick={() => { const playing = SFX.toggleBGM(); setBgmPlaying(playing); }} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', borderRadius: 6, cursor: 'pointer', fontSize: '1rem',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}>{bgmPlaying ? '🔊' : '🔇'}</button>
          <input type="range" min="0" max="100" value={Math.round(bgmVol * 100)}
            onChange={e => { const v = Number(e.target.value) / 100; setBgmVol(v); SFX.setBGMVolume(v); }}
            style={{ width: width < 768 ? 50 : 70, height: 4, accentColor: '#FFD700', cursor: 'pointer', opacity: 0.7 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? (width >= 768 ? 24 : 16) : (width >= 768 ? 8 : 6),
              height: width >= 768 ? 8 : 6, borderRadius: 4,
              background: i <= step ? 'rgba(255,215,0,0.8)' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: r.pad, zIndex: 5 }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)', borderRadius: 32,
          padding: `${r.pad * 1.2}px ${r.pad * 1.5}px`,
          maxWidth: r.contentMax, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 100px rgba(255,215,0,0.05)',
          minHeight: width < 768 ? 280 : width >= 1200 ? 460 : 360,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>

          {/* TITLE */}
          {currentStep.id === 'title' && (
            <div style={{ textAlign: 'center', animation: 'winnerPop 0.8s ease' }}>
              <h1 style={{
                fontFamily: "'Black Han Sans', sans-serif", fontSize: r.titleFs, color: '#1e293b',
                marginBottom: 8, letterSpacing: 3,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: r.gap,
              }}>
                <img src="/eeum-logo.png" alt="이음교회" style={{ height: r.eeumH, objectFit: 'contain' }} />
                AWANA 시상식
              </h1>
              <p style={{ color: '#64748b', fontSize: r.bodyFs, marginBottom: 8 }}>어와나 클럽 점수 발표</p>
              <div style={{ display: 'flex', gap: r.gap, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
                {TEAMS.map(t => (
                  <div key={t} style={{
                    width: r.iconH * 1.2, height: r.iconH * 1.2, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${TEAM_COLORS[t].mid}, ${TEAM_COLORS[t].bg})`,
                    boxShadow: `0 4px 16px ${TEAM_COLORS[t].glow}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontWeight: 900, fontSize: r.smallFs,
                    fontFamily: "'Black Han Sans', sans-serif",
                    animation: `float 3s ease-in-out ${TEAMS.indexOf(t) * 0.3}s infinite`,
                  }}>{t[0]}</div>
                ))}
              </div>
              <p style={{ color: '#94a3b8', fontSize: r.smallFs, marginTop: 32 }}>→ 또는 스페이스바를 눌러 시작하세요</p>
            </div>
          )}

          {/* Dynamic middle steps */}
          {FLOW_ITEMS.some(fi => fi.id === currentStep?.id) && (() => {
            const item = FLOW_ITEMS.find(fi => fi.id === currentStep.id)!;
            const [cat, sub] = item.dataKey.split('.');
            const scores = (data as any)[cat][sub] as Record<string, number>;
            return (
              <div style={{ width: '100%', animation: 'winnerPop 0.6s ease' }}>
                <h2 style={{
                  fontFamily: "'Black Han Sans', sans-serif", fontSize: r.h2Fs,
                  textAlign: 'center', color: '#1e293b', marginTop: 0,
                  marginBottom: width < 768 ? 12 : 24, paddingTop: width < 768 ? 8 : 16,
                  letterSpacing: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: r.gap,
                }}>
                  <img src={item.icon} alt="" style={{ height: r.iconH * 1.4, objectFit: 'contain' }} />
                  {item.title}
                </h2>
                <BarChart scores={scores} revealed={true} chartHeight={r.barHeight} barMaxWidth={r.barMaxW} numberFontSize={r.barNumFs} />
                <LeaderBadge scores={scores} r={r} />
              </div>
            );
          })()}

          {/* GRAND BUILDUP */}
          {currentStep.id === 'grand_buildup' && (() => {
            return (
              <div style={{
                width: '100%', height: '100%', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                animation: 'grandReveal 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative', minHeight: width < 768 ? 300 : 400,
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(ellipse at center, rgba(15,23,42,0.6) 0%, rgba(15,23,42,0.9) 70%)',
                  borderRadius: 24, pointerEvents: 'none',
                }} />
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute', top: `${8 + (i * 7) % 80}%`, left: `${3 + (i * 8.3) % 94}%`,
                    width: i % 3 === 0 ? 4 : 2, height: i % 3 === 0 ? 4 : 2, borderRadius: '50%',
                    background: i % 2 === 0 ? '#FFD700' : '#FFA500',
                    animation: `starSpin ${1.5 + i * 0.3}s ease-in-out infinite`,
                    opacity: 0.6 + (i % 3) * 0.15, pointerEvents: 'none',
                  }} />
                ))}
                {['✦', '★', '✧', '⭐', '✦', '★', '✧', '⭐'].map((star, i) => (
                  <div key={`star-${i}`} style={{
                    position: 'absolute', top: `${5 + (i * 11) % 85}%`, left: `${2 + (i * 13) % 96}%`,
                    fontSize: width < 768 ? '0.7rem' : '1rem', opacity: 0.3,
                    animation: `starSpin ${2 + i * 0.4}s linear infinite`, color: '#FFD700', pointerEvents: 'none',
                  }}>{star}</div>
                ))}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div style={{ fontSize: width < 768 ? '3rem' : '4.5rem', animation: 'crownBounce 2s ease-in-out infinite', filter: 'drop-shadow(0 4px 20px rgba(255,215,0,0.6))', marginBottom: 16 }}>🏆</div>
                  <h2 style={{
                    fontFamily: "'Black Han Sans', sans-serif", fontSize: width < 768 ? '1.8rem' : '2.6rem',
                    background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700, #FFF8DC, #FFD700)',
                    backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    animation: 'textShine 3s linear infinite', letterSpacing: 6, marginBottom: 8,
                  }}>최종 우승 발표</h2>
                  <div style={{
                    fontFamily: "'Noto Sans KR', sans-serif", fontSize: width < 768 ? '0.95rem' : '1.2rem',
                    color: 'rgba(255,255,255,0.7)', fontWeight: 500,
                    animation: 'slideUp 0.8s ease 0.3s both', letterSpacing: 2,
                  }}>And the winner is...</div>
                  <div style={{
                    width: width < 768 ? 120 : 200, height: 2,
                    background: 'linear-gradient(90deg, transparent, #FFD700, transparent)',
                    margin: '16px auto 0', animation: 'pulse 2s ease-in-out infinite',
                  }} />
                </div>
              </div>
            );
          })()}

          {/* GRAND WINNER */}
          {currentStep.id === 'grand_winner' && (() => {
            const ranked = [...TEAMS].sort((a, b) => (totals.total[b] || 0) - (totals.total[a] || 0));

            if (grandTied || grandAllZero) {
              const tiedTeams = grandAllZero ? [...TEAMS] : grandWinner as string[];
              return (
                <div style={{ width: '100%', textAlign: 'center', animation: 'grandReveal 1s cubic-bezier(0.34, 1.56, 0.64, 1)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '140%', height: '140%', background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, rgba(147,51,234,0.1) 30%, transparent 60%)', opacity: 0.5, pointerEvents: 'none', animation: 'pulse 3s ease-in-out infinite' }} />
                  {['✦', '★', '✧', '⭐', '✦', '★'].map((star, i) => (
                    <div key={i} style={{ position: 'absolute', top: `${10 + (i * 13) % 60}%`, left: `${5 + (i * 17) % 90}%`, fontSize: width < 768 ? '0.8rem' : '1.2rem', opacity: 0.4, animation: `starSpin ${2 + i * 0.5}s linear infinite`, color: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#FFD700', '#A855F7'][i], pointerEvents: 'none' }}>{star}</div>
                  ))}
                  <div style={{ animation: 'crownBounce 2s ease-in-out infinite', fontSize: width < 768 ? '2rem' : '2.8rem', marginBottom: 0, filter: 'drop-shadow(0 4px 12px rgba(255,215,0,0.5))' }}>🤝</div>
                  <h2 style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: width < 768 ? '1.4rem' : r.h2Fs, background: 'linear-gradient(90deg, #EF4444, #3B82F6, #22C55E, #EAB308, #EF4444)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'textShine 3s linear infinite', marginBottom: 8, letterSpacing: 4 }}>
                    {grandAllZero ? '모두 함께!' : '공동 우승!'}
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: width < 768 ? 12 : 24, animation: 'popIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both', position: 'relative', zIndex: 2 }}>
                    {tiedTeams.map((t, i) => {
                      const tc = TEAM_COLORS[t as Team];
                      return (
                        <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: `popIn 0.6s ease ${0.4 + i * 0.15}s both` }}>
                          <Trophy color={tc.bg} size={width < 768 ? 48 : 64} />
                          <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: width < 768 ? '1.3rem' : '1.6rem', color: tc.bg, textShadow: `0 0 20px ${tc.glow}`, margin: '4px 0', letterSpacing: 4 }}>{t}</div>
                          <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: width < 768 ? '0.85rem' : '1rem', color: '#FFF', background: `linear-gradient(135deg, ${tc.bg}, ${tc.dark})`, padding: '4px 16px', borderRadius: 50, boxShadow: `0 0 20px ${tc.glow}`, border: '2px solid rgba(255,255,255,0.3)' }}>{(totals.total[t] || 0).toLocaleString()}점</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: width < 768 ? 6 : 12, marginTop: 16, animation: 'slideUp 0.8s ease 0.6s both' }}>
                    {(() => {
                      let otherIdx = 0;
                      return ranked.map((t, i) => {
                        const isCo = tiedTeams.includes(t);
                        const tc = TEAM_COLORS[t];
                        const coHeight = width < 768 ? 80 : 110;
                        const otherHeights = [45, 30, 20, 15];
                        const h = isCo ? coHeight : otherHeights[otherIdx++] || 15;
                        return (
                          <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: `slideUp 0.6s ease ${0.8 + i * 0.15}s both` }}>
                            {isCo && <div style={{ fontSize: width < 768 ? '1.2rem' : '1.5rem', marginBottom: 4 }}>🥇</div>}
                            <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: isCo ? (width < 768 ? '1rem' : '1.2rem') : (width < 768 ? '0.8rem' : '0.95rem'), color: tc.bg, fontWeight: 900, textShadow: isCo ? `0 0 12px ${tc.glow}` : 'none' }}>{t}</div>
                            <div style={{ fontSize: width < 768 ? '0.65rem' : '0.8rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{(totals.total[t] || 0).toLocaleString()}</div>
                            <div style={{
                              width: width < 768 ? 56 : 90, height: h,
                              background: isCo ? `linear-gradient(180deg, ${tc.mid}, ${tc.bg}, ${tc.dark})` : `linear-gradient(180deg, ${tc.mid}AA, ${tc.bg}88)`,
                              borderRadius: '12px 12px 0 0',
                              boxShadow: isCo ? `0 0 24px ${tc.glow}, inset 0 2px 8px rgba(255,255,255,0.3)` : '0 4px 12px rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              animation: `podiumRise 0.8s ease ${1 + i * 0.2}s both`, transformOrigin: 'bottom', position: 'relative', overflow: 'hidden',
                            }}>
                              {isCo && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 40%)', animation: 'shimmer 2s infinite' }} />}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ marginTop: 12, animation: 'slideUp 0.6s ease 1.6s both' }}>
                    <div style={{ fontSize: width < 768 ? '1.4rem' : '1.8rem', marginBottom: 4, animation: 'crownBounce 1.5s ease-in-out infinite' }}>🎉🤝🎉</div>
                    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: r.smallFs, color: '#475569', fontWeight: 600, lineHeight: 1.6 }}>
                      {grandAllZero ? '모두 함께 달려봐요! 하나님의 은혜 안에서 함께 성장해요!' : '대단해요! 함께 우승! 하나님의 은혜 안에서 모두 수고하셨습니다!'}
                    </div>
                  </div>
                </div>
              );
            }

            // Solo winner
            const gc = TEAM_COLORS[grandWinner as Team];
            const podiumOrder = [ranked[1], ranked[0], ranked[2], ranked[3]];
            const podiumHeights = width < 768 ? [60, 90, 45, 30] : [80, 120, 60, 40];
            return (
              <div style={{ width: '100%', textAlign: 'center', animation: 'grandReveal 1s cubic-bezier(0.34, 1.56, 0.64, 1)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '140%', height: '140%', background: `radial-gradient(circle, ${gc.glow} 0%, transparent 60%)`, opacity: 0.3, pointerEvents: 'none', animation: 'pulse 3s ease-in-out infinite' }} />
                {['✦', '★', '✧', '⭐', '✦', '★'].map((star, i) => (
                  <div key={i} style={{ position: 'absolute', top: `${10 + (i * 13) % 60}%`, left: `${5 + (i * 17) % 90}%`, fontSize: width < 768 ? '0.8rem' : '1.2rem', opacity: 0.4, animation: `starSpin ${2 + i * 0.5}s linear infinite`, color: i % 2 === 0 ? '#FFD700' : gc.mid, pointerEvents: 'none' }}>{star}</div>
                ))}
                <div style={{ animation: 'crownBounce 2s ease-in-out infinite', fontSize: width < 768 ? '2rem' : '2.8rem', marginBottom: 0, filter: 'drop-shadow(0 4px 12px rgba(255,215,0,0.5))' }}>👑</div>
                <h2 style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: width < 768 ? '1.6rem' : r.h2Fs, background: 'linear-gradient(90deg, #FFD700, #FFA500, #FFD700, #FFF8DC, #FFD700)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'textShine 3s linear infinite', marginBottom: 8, letterSpacing: 4 }}>최종 우승</h2>
                <div style={{ animation: 'popIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both', position: 'relative', zIndex: 2 }}>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: width < 768 ? 130 : 170, height: width < 768 ? 130 : 170, borderRadius: '50%', border: `3px solid ${gc.bg}33`, animation: 'glowPulse 2s ease-in-out infinite', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: width < 768 ? 170 : 220, height: width < 768 ? 170 : 220, borderRadius: '50%', border: `2px solid ${gc.bg}1A`, animation: 'glowPulse 2s ease-in-out infinite 0.5s', pointerEvents: 'none' }} />
                  <Trophy color={gc.bg} size={r.grandTrophy} />
                  <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.grandTeamFs, color: gc.bg, textShadow: `0 0 40px ${gc.glow}, 0 0 80px ${gc.glow}, 0 2px 4px rgba(0,0,0,0.2)`, margin: '4px 0 4px', letterSpacing: 8, animation: 'pulse 2s ease-in-out infinite' }}>{grandWinner as string}</div>
                  <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: r.grandScoreFs, color: '#FFF', background: `linear-gradient(135deg, ${gc.bg}, ${gc.dark})`, padding: '6px 28px', borderRadius: 50, display: 'inline-block', boxShadow: `0 0 40px ${gc.glow}, 0 8px 24px rgba(0,0,0,0.2)`, border: '3px solid rgba(255,255,255,0.3)', animation: 'glowPulse 2s ease-in-out infinite' }}>
                    {(totals.total[grandWinner as string] || 0).toLocaleString()}점
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: width < 768 ? 6 : 12, marginTop: 16, animation: 'slideUp 0.8s ease 0.6s both' }}>
                  {podiumOrder.map((t, i) => {
                    const isChamp = i === 1;
                    const tc = TEAM_COLORS[t];
                    return (
                      <div key={t} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: `slideUp 0.6s ease ${0.8 + i * 0.15}s both` }}>
                        {isChamp && <div style={{ fontSize: width < 768 ? '1.5rem' : '2rem', marginBottom: 4 }}>🥇</div>}
                        <div style={{ fontFamily: "'Black Han Sans', sans-serif", fontSize: isChamp ? (width < 768 ? '1.1rem' : '1.4rem') : (width < 768 ? '0.85rem' : '1rem'), color: tc.bg, fontWeight: 900, textShadow: isChamp ? `0 0 12px ${tc.glow}` : 'none' }}>{t}</div>
                        <div style={{ fontSize: width < 768 ? '0.7rem' : '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>{(totals.total[t] || 0).toLocaleString()}</div>
                        <div style={{
                          width: width < 768 ? 56 : 90, height: podiumHeights[i],
                          background: isChamp ? `linear-gradient(180deg, ${tc.mid}, ${tc.bg}, ${tc.dark})` : `linear-gradient(180deg, ${tc.mid}AA, ${tc.bg}88)`,
                          borderRadius: '12px 12px 0 0',
                          boxShadow: isChamp ? `0 0 24px ${tc.glow}, inset 0 2px 8px rgba(255,255,255,0.3)` : '0 4px 12px rgba(0,0,0,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          animation: `podiumRise 0.8s ease ${1 + i * 0.2}s both`, transformOrigin: 'bottom', position: 'relative', overflow: 'hidden',
                        }}>
                          {isChamp && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 40%)', animation: 'shimmer 2s infinite' }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, animation: 'slideUp 0.6s ease 1.6s both' }}>
                  <div style={{ fontSize: width < 768 ? '1.4rem' : '1.8rem', marginBottom: 4, animation: 'crownBounce 1.5s ease-in-out infinite' }}>🎉🎊🎉</div>
                  <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: r.smallFs, color: '#475569', fontWeight: 600, lineHeight: 1.6 }}>
                    축하합니다! <span style={{ color: '#94a3b8' }}>하나님의 은혜 안에서 모두 수고하셨습니다!</span>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: r.gap, padding: `${r.pad}px ${r.pad}px ${r.pad * 1.2}px`, zIndex: 10 }}>
        <button onClick={prevStep} disabled={step === 0} style={{
          padding: `${r.padY + 2}px ${r.pad * 2}px`,
          background: step === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: step === 0 ? 'rgba(255,255,255,0.3)' : 'white',
          borderRadius: 12, cursor: step === 0 ? 'default' : 'pointer',
          fontFamily: "'Black Han Sans', sans-serif", fontSize: r.bodyFs, letterSpacing: 1,
        }}>← 이전</button>
        <button onClick={nextStep} disabled={step === steps.length - 1} style={{
          padding: `${r.padY + 2}px ${r.pad * 2.5}px`,
          background: step === steps.length - 1 ? 'rgba(255,215,0,0.2)' : 'linear-gradient(135deg, #FFD700, #FFA500)',
          border: 'none',
          color: step === steps.length - 1 ? 'rgba(255,215,0,0.5)' : '#1e293b',
          borderRadius: 12, cursor: step === steps.length - 1 ? 'default' : 'pointer',
          fontFamily: "'Black Han Sans', sans-serif",
          fontSize: r.bodyFs === '0.8rem' ? '1rem' : '1.1rem', letterSpacing: 1,
          boxShadow: step < steps.length - 1 ? '0 4px 20px rgba(255,215,0,0.3)' : 'none',
        }}>
          {step === steps.length - 1 ? '🏆 끝' : '다음 →'}
        </button>
      </div>

      {/* AWANA logo */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: `${r.padY}px ${r.pad}px 0`, marginBottom: 36, zIndex: 10 }}>
        <img src="/awana-logo-awana-clubs.avif" alt="AWANA 클럽" style={{ height: r.awanaBottomH, objectFit: 'contain', opacity: 0.85 }} />
      </div>

      {/* Step label */}
      <div style={{
        position: 'fixed', bottom: 6, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.35)', fontSize: width < 768 ? '0.6rem' : '0.7rem',
        fontFamily: "'Noto Sans KR', sans-serif", zIndex: 10,
      }}>
        ⏎ Enter / → : 다음 | ← / Backspace : 이전
      </div>
    </div>
  );
}
