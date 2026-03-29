import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ─── Types ───
type Team = 'RED' | 'BLUE' | 'GREEN' | 'YELLOW';
type PhotoPhase = 'orbit' | 'hero' | 'done';
type CelebrationPhase = 'settling' | 'gather' | 'burst' | 'final';

interface TeamMember {
  name: string;
  avatar_url: string | null;
  team: string;
}

interface CeremonyPhotosProps {
  winners: TeamMember[];
  losers: TeamMember[];
  teamColors: Record<Team, { bg: string; light: string; mid: string; dark: string; glow: string }>;
  width: number;
  isActive: boolean;
  onBurst?: () => void; // burst 시 효과음 콜백
}

// ─── Position generators ───
function generateWinnerPositions(count: number): Array<{ top: string; left: string; rot: number }> {
  const positions: Array<{ top: string; left: string; rot: number }> = [];
  if (count === 0) return positions;
  const half = Math.ceil(count / 2);
  const leftCols = [8, 17];
  const leftPositions: Array<{ top: number; left: number; rot: number }> = [];
  for (let i = 0; i < half; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const totalRows = Math.ceil(half / 2);
    const topBase = totalRows > 1 ? 15 + (row / (totalRows - 1)) * 42 : 40;
    const topJitter = col === 1 ? 5 : ((row % 2) * -3);
    const leftJitter = (row % 2) * 2;
    leftPositions.push({ top: topBase + topJitter, left: leftCols[col] + leftJitter, rot: ((i * 11 + 3) % 15) - 7 });
  }
  for (const p of leftPositions) {
    positions.push({ top: `${p.top.toFixed(1)}%`, left: `${p.left.toFixed(1)}%`, rot: p.rot });
  }
  const rightN = count - half;
  for (let i = 0; i < rightN; i++) {
    const mirror = leftPositions[i % leftPositions.length];
    positions.push({
      top: `${mirror.top.toFixed(1)}%`,
      left: `${(100 - mirror.left).toFixed(1)}%`,
      rot: -mirror.rot,
    });
  }
  return positions;
}

function generateLoserPositions(count: number): Array<{ top: string; left: string; rot: number }> {
  const positions: Array<{ top: string; left: string; rot: number }> = [];
  if (count === 0) return positions;
  const ring1N = Math.ceil(count * 0.6);
  const ring2N = count - ring1N;
  const rings = [
    { n: ring1N, r: 36, offset: 0 },
    { n: ring2N, r: 26, offset: Math.PI / 10 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const angle = ring.offset + (i / ring.n) * 2 * Math.PI - Math.PI / 2;
      const x = 50 + ring.r * 1.1 * Math.cos(angle);
      const y = 50 + ring.r * 0.9 * Math.sin(angle);
      positions.push({
        top: `${Math.max(3, Math.min(97, y)).toFixed(1)}%`,
        left: `${Math.max(3, Math.min(97, x)).toFixed(1)}%`,
        rot: ((i * 11 + 5) % 21) - 10,
      });
    }
  }
  return positions;
}

// ─── Helpers ───
function renderAvatar(
  avatarUrl: string | null,
  name: string,
  sz: number,
  tc: { bg: string; mid: string },
  eager = false,
) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        loading={eager ? 'eager' : undefined}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = 'none';
          el.parentElement!.style.background = `linear-gradient(135deg,${tc.mid},${tc.bg})`;
          el.parentElement!.innerHTML = `<span style="color:#fff;font-weight:900;font-size:${Math.round(sz * 0.4)}px;font-family:'Black Han Sans',sans-serif">${name[0]}</span>`;
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${tc.mid}, ${tc.bg})`,
        color: '#fff', fontWeight: 900, fontSize: sz * 0.4, fontFamily: "'Black Han Sans', sans-serif",
      }}
    >
      {name[0]}
    </div>
  );
}

// ═══════════════════════════════════════════
// ─── CeremonyPhotos Component ───
// ═══════════════════════════════════════════
export default function CeremonyPhotos({ winners, losers, teamColors, width, isActive, onBurst }: CeremonyPhotosProps) {
  const [photoPhase, setPhotoPhase] = useState<PhotoPhase>('orbit');
  const [heroIndex, setHeroIndex] = useState(-1);
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [celebrationPhase, setCelebrationPhase] = useState<CelebrationPhase>('settling');

  // ─── Phase timer ───
  useEffect(() => {
    if (!isActive) {
      setPhotoPhase('orbit');
      setHeroIndex(-1);
      setCelebrationPhase('settling');
      return;
    }

    const winnerCount = winners.length;

    // Shuffle winner indices
    const indices = Array.from({ length: winnerCount }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setShuffledOrder(indices);
    setPhotoPhase('orbit');
    setHeroIndex(-1);
    setCelebrationPhase('settling');

    // orbit -> hero after 2.2s
    const t1 = setTimeout(() => {
      setPhotoPhase('hero');
      setHeroIndex(0);
    }, 2200);

    // hero: cycle through winners one by one (1.2s each)
    const heroTimers: ReturnType<typeof setTimeout>[] = [];
    for (let idx = 1; idx < winnerCount; idx++) {
      heroTimers.push(setTimeout(() => {
        setHeroIndex(idx);
      }, 2200 + idx * 1200));
    }

    // hero -> done after all winners revealed + 0.8s
    const doneTime = 2200 + Math.max(winnerCount, 1) * 1200 + 800;
    const t2 = setTimeout(() => {
      setPhotoPhase('done');
      setCelebrationPhase('settling');
    }, doneTime);

    // Celebration sub-phases: settling(2s) -> gather(0.8s) -> burst(0.6s) -> final
    const t3 = setTimeout(() => setCelebrationPhase('gather'), doneTime + 2000);
    const t4 = setTimeout(() => { setCelebrationPhase('burst'); onBurst?.(); }, doneTime + 2800);
    const t5 = setTimeout(() => setCelebrationPhase('final'), doneTime + 3400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      heroTimers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  if (!isActive) return null;

  const allPhotos = [...losers.map(m => ({ ...m, isWinner: false })), ...winners.map(m => ({ ...m, isWinner: true }))];
  const loserPos = generateLoserPositions(losers.length);
  const winPos = generateWinnerPositions(winners.length);
  const loserSz = width < 768 ? 44 : 60;
  const winSz = width < 768 ? 90 : 140;

  // Celebration offset calculator for winner positions
  function getCelebrationTransform(pos: { top: string; left: string }, _index: number) {
    if (photoPhase !== 'done') return {};
    const posLeft = parseFloat(pos.left);
    const posTop = parseFloat(pos.top);
    const dx = 50 - posLeft; // direction toward center
    const dy = 50 - posTop;

    if (celebrationPhase === 'gather') {
      // 확 중앙으로 모임 (80% 이동 + 작게 압축)
      return { x: `${dx * 0.85}%`, y: `${dy * 0.85}%`, scale: 0.4 };
    }
    if (celebrationPhase === 'burst') {
      // 폭죽처럼 바깥으로 펑! (원래 위치 반대로 오버슛)
      return { x: `${-dx * 0.5}%`, y: `${-dy * 0.5}%`, scale: 1.5 };
    }
    return {};
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* Phase 1: Shooting Star Entrance */}
      {photoPhase === 'orbit' && allPhotos.map((photo, i) => {
        const tc = teamColors[photo.team as Team];
        const isW = photo.isWinner;
        const sz = isW ? (width < 768 ? 65 : 90) : (width < 768 ? 40 : 55);
        const directions = [
          { x: -500, y: (i * 73 % 200) - 100 },
          { x: 500, y: (i * 73 % 200) - 100 },
          { x: (i * 97 % 300) - 150, y: -400 },
          { x: (i * 97 % 300) - 150, y: 400 },
        ];
        const dir = directions[i % 4];
        const floatX = Math.cos(i * 2.39) * (width < 768 ? 60 : 120);
        const floatY = Math.sin(i * 2.39) * (width < 768 ? 40 : 80);
        return (
          <motion.div key={`orbit-${i}`}
            initial={{ x: dir.x, y: dir.y, scale: 0.1, opacity: 0, rotate: (i * 47 % 360) - 180 }}
            animate={{ x: floatX, y: floatY, scale: isW ? 0.9 : 0.6, opacity: isW ? 1 : 0.5, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 60 + (i * 13 % 40), damping: 12 + (i * 7 % 5), delay: i * 0.08 }}
            style={{
              position: 'absolute', top: '50%', left: '50%', marginLeft: -sz / 2, marginTop: -sz / 2,
              width: sz, height: sz, borderRadius: '50%', zIndex: isW ? 3 : 1, pointerEvents: 'none',
            }}
          >
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
              border: isW ? `3px solid ${tc.bg}` : `1.5px solid ${tc.bg}66`,
              boxShadow: isW ? `0 0 16px ${tc.glow}` : `0 0 6px ${tc.glow}33`,
              filter: isW ? 'none' : 'brightness(0.8) saturate(0.6)',
            }}>
              {renderAvatar(photo.avatar_url, photo.name, sz, tc, true)}
            </div>
            {isW && (
              <div style={{
                position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                background: `${tc.bg}CC`, color: '#fff',
                fontSize: width < 768 ? '0.45rem' : '0.6rem', fontWeight: 700,
                padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap',
              }}>{photo.name}</div>
            )}
          </motion.div>
        );
      })}

      {/* Center glow during orbit */}
      <motion.div
        animate={photoPhase === 'orbit' ? { scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] } : { opacity: 0 }}
        transition={photoPhase === 'orbit' ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        style={{
          position: 'absolute', top: '50%', left: '50%', width: 80, height: 80,
          marginLeft: -40, marginTop: -40, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(147,51,234,0.15) 50%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }}
      />

      {/* Phase 2+3: Hero Reveal + Final positions */}
      {(photoPhase === 'hero' || photoPhase === 'done') && (
        <>
          {/* Losers spring to positions */}
          {loserPos.map((pos, i) => {
            const p = losers[i]; if (!p) return null;
            const tc = teamColors[p.team as Team];
            return (
              <motion.div key={`lo-${i}`}
                initial={{ top: '50%', left: '50%', scale: 0.15, opacity: 0 }}
                animate={{ top: pos.top, left: pos.left, scale: 1, opacity: [0.2, 0.5, 0.25, 0.45, 0.3] }}
                transition={{
                  top: { type: 'spring', stiffness: 120, damping: 14, delay: i * 0.04 },
                  left: { type: 'spring', stiffness: 120, damping: 14, delay: i * 0.04 },
                  scale: { type: 'spring', stiffness: 200, damping: 15, delay: i * 0.04 },
                  opacity: { duration: 6, repeat: Infinity, delay: i * 0.08 },
                }}
                style={{
                  position: 'absolute', transform: 'translate(-50%,-50%)',
                  zIndex: 1, width: loserSz, height: loserSz, borderRadius: '50%',
                  animation: `faceFloatLoser ${(4.5 + (i % 3) * 0.5).toFixed(1)}s ease-in-out ${(i * 0.1).toFixed(2)}s infinite`,
                  pointerEvents: 'none',
                }}
              >
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                  transform: `rotate(${pos.rot}deg)`, border: `2px solid ${tc.bg}44`,
                  boxShadow: `0 0 4px ${tc.glow}22`, filter: 'brightness(0.7) saturate(0.5)',
                }}>
                  {renderAvatar(p.avatar_url, p.name, loserSz, tc)}
                </div>
                <div style={{
                  position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                  background: `${tc.bg}88`, color: '#fff', fontSize: width < 768 ? '0.4rem' : '0.5rem',
                  fontWeight: 500, padding: '1px 4px', borderRadius: 6, whiteSpace: 'nowrap', opacity: 0.6,
                }}>{p.name}</div>
              </motion.div>
            );
          })}

          {/* Winners revealed one by one */}
          {winPos.map((pos, i) => {
            const p = winners[i]; if (!p) return null;
            const tc = teamColors[p.team as Team];
            const revealOrder = shuffledOrder.indexOf(i);
            const isRevealed = heroIndex >= revealOrder;
            const isCurrentHero = heroIndex === revealOrder;
            if (!isRevealed) return null;

            const isBurst = celebrationPhase === 'burst';
            const isGather = celebrationPhase === 'gather';
            // gather: 중앙(50%,50%)으로 모임 / burst: 바깥으로 오버슛 / 나머지: 제자리
            const posLeft = parseFloat(pos.left);
            const posTop = parseFloat(pos.top);
            const burstLeft = posLeft + (posLeft - 50) * 0.2; // 반대로 20% 더 멀리
            const burstTop = posTop + (posTop - 50) * 0.2;
            const targetTop = isGather ? '50%' : isBurst ? `${burstTop}%` : pos.top;
            const targetLeft = isGather ? '50%' : isBurst ? `${burstLeft}%` : pos.left;
            const targetScale = isGather ? 0.4 : isBurst ? 1.5 : 1;

            return (
              <motion.div key={`wi-${i}`}
                initial={{ top: '50%', left: '50%', scale: 3, opacity: 0 }}
                animate={{
                  top: targetTop,
                  left: targetLeft,
                  scale: targetScale,
                  opacity: 1,
                }}
                transition={isGather
                  ? { type: 'spring', stiffness: 150, damping: 18 }
                  : isBurst
                    ? { type: 'spring', stiffness: 200, damping: 10, mass: 0.8 }
                    : { type: 'spring', stiffness: 80, damping: 14 }
                }
                style={{
                  position: 'absolute', transform: 'translate(-50%,-50%)',
                  zIndex: isCurrentHero ? 30 : 3, width: winSz, height: winSz, borderRadius: '50%',
                  pointerEvents: 'none',
                }}
              >
                <motion.div
                  animate={{ scale: [1, 1.06, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <motion.div
                    animate={{
                      boxShadow: isCurrentHero
                        ? [
                            `0 0 25px rgba(255,215,0,0.5), 0 0 40px ${tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 50px rgba(255,215,0,0.9), 0 0 70px ${tc.glow}88, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 25px rgba(255,215,0,0.5), 0 0 40px ${tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                          ]
                        : [
                            `0 0 15px rgba(255,215,0,0.3), 0 0 24px ${tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 35px rgba(255,215,0,0.7), 0 0 48px ${tc.glow}66, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 15px rgba(255,215,0,0.3), 0 0 24px ${tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                          ],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                      transform: `rotate(${pos.rot}deg)`, border: `4px solid ${tc.bg}`,
                    }}
                  >
                    {p.avatar_url
                      ? (
                        <img
                          src={p.avatar_url} alt={p.name} loading="eager"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.1) contrast(1.05)' }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = 'none';
                            el.parentElement!.style.background = `linear-gradient(135deg,${tc.mid},${tc.bg})`;
                            el.parentElement!.innerHTML = `<span style="color:#fff;font-weight:900;font-size:${Math.round(winSz * 0.4)}px;font-family:'Black Han Sans',sans-serif">${p.name[0]}</span>`;
                          }}
                        />
                      )
                      : (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `linear-gradient(135deg, ${tc.mid}, ${tc.bg})`,
                          color: '#fff', fontWeight: 900, fontSize: winSz * 0.4, fontFamily: "'Black Han Sans', sans-serif",
                        }}>{p.name[0]}</div>
                      )
                    }
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '50%',
                      background: 'linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.35) 50%, transparent 75%)',
                      backgroundSize: '200% 100%', animation: 'faceShimmer 3s linear infinite',
                      willChange: 'background-position', pointerEvents: 'none',
                    }} />
                  </motion.div>
                </motion.div>

                {/* Team aura - appears when all winners are placed (done phase) with wave delay */}
                {photoPhase === 'done' && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0.3, 0.6] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                    style={{
                      position: 'absolute', inset: -10, borderRadius: '50%',
                      background: `radial-gradient(circle, ${tc.glow} 0%, transparent 70%)`,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                <div style={{
                  position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                  background: `linear-gradient(135deg, ${tc.bg}, ${tc.dark})`, color: '#fff',
                  fontSize: width < 768 ? '0.65rem' : '0.85rem', fontWeight: 800,
                  padding: '2px 8px', borderRadius: 8, boxShadow: `0 2px 8px ${tc.glow}88`,
                  whiteSpace: 'nowrap', zIndex: 2,
                }}>{p.name}</div>
              </motion.div>
            );
          })}
        </>
      )}

      {/* Phase done: UFO effects */}
      {photoPhase === 'done' && (
        <>
          {/* White screen flash */}
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'absolute', inset: 0, background: '#fff', pointerEvents: 'none', zIndex: 50 }}
          />
          {/* Shockwave rings */}
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.div key={`shock-${i}`}
              initial={{ scale: 0, opacity: 0.6 }}
              animate={{ scale: 3, opacity: 0 }}
              transition={{ duration: 1.2, delay, ease: 'easeOut' }}
              style={{
                position: 'absolute', top: '50%', left: '50%', width: 120, height: 120,
                marginLeft: -60, marginTop: -60, borderRadius: '50%',
                border: '2px solid rgba(255,215,0,0.5)', pointerEvents: 'none', zIndex: 40,
              }}
            />
          ))}
          {/* Light burst beams */}
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div key={`beam-${i}`}
              initial={{ opacity: 0.7, scaleY: 0 }}
              animate={{ opacity: 0, scaleY: 1 }}
              transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
              style={{
                position: 'absolute', top: '50%', left: '50%', width: 2, height: '50%',
                transformOrigin: 'top center', transform: `rotate(${i * 30}deg)`,
                background: 'linear-gradient(180deg, rgba(255,215,0,0.8), transparent)',
                pointerEvents: 'none', zIndex: 39,
              }}
            />
          ))}
          {/* Star particles */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const dist = 100 + (i * 37 % 150);
            return (
              <motion.div key={`star-p-${i}`}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.3 }}
                transition={{ duration: 1, delay: 0.1 + i * 0.03, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: '50%', left: '50%', width: 6, height: 6,
                  marginLeft: -3, marginTop: -3, borderRadius: '50%',
                  background: i % 2 === 0 ? '#FFD700' : '#FFA500',
                  pointerEvents: 'none', zIndex: 41,
                }}
              />
            );
          })}

          {/* Final Celebration: confetti-like particle burst from center */}
          {(celebrationPhase === 'burst' || celebrationPhase === 'final') && (
            <>
              {Array.from({ length: 30 }).map((_, i) => {
                const angle = (i / 30) * Math.PI * 2;
                const dist = 80 + (i * 41 % 180);
                const colors = ['#FFD700', '#FFA500', '#FF69B4', '#9333EA', '#22C55E', '#3B82F6', '#EF4444'];
                const color = colors[i % colors.length];
                const size = 3 + (i % 4) * 2;
                return (
                  <motion.div key={`celeb-p-${i}`}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1.5 }}
                    animate={{
                      x: Math.cos(angle) * dist * (1 + Math.random() * 0.5),
                      y: Math.sin(angle) * dist * (1 + Math.random() * 0.3),
                      opacity: 0,
                      scale: 0,
                      rotate: (i % 2 === 0 ? 1 : -1) * 360,
                    }}
                    transition={{ duration: 1.2, ease: 'easeOut', delay: i * 0.02 }}
                    style={{
                      position: 'absolute', top: '50%', left: '50%',
                      width: size, height: size,
                      marginLeft: -size / 2, marginTop: -size / 2,
                      borderRadius: i % 3 === 0 ? '50%' : '2px',
                      background: color,
                      pointerEvents: 'none', zIndex: 45,
                    }}
                  />
                );
              })}
              {/* Center flash for celebration burst */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0.8 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: '50%', left: '50%', width: 60, height: 60,
                  marginLeft: -30, marginTop: -30, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,165,0,0.3) 40%, transparent 70%)',
                  pointerEvents: 'none', zIndex: 44,
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
