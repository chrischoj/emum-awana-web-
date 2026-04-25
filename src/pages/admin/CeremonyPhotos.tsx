import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_CEREMONY_EFFECT_PRESET } from '../../config/ceremonyEffects';
import type { CeremonyEffectPresetId } from '../../config/ceremonyEffects';

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
  height?: number;
  compact?: boolean;
  effectPreset?: CeremonyEffectPresetId;
  winnerLabel?: string;
  winnerScore?: number;
  isActive: boolean;
  onBurst?: () => void; // burst 시 효과음 콜백
}

// ─── Position generators ───
function generateWinnerPositions(count: number, compact = false): Array<{ top: string; left: string; rot: number }> {
  const positions: Array<{ top: string; left: string; rot: number }> = [];
  if (count === 0) return positions;
  const half = Math.ceil(count / 2);
  const leftCols = compact ? [11, 20] : [8, 17];
  const leftPositions: Array<{ top: number; left: number; rot: number }> = [];
  for (let i = 0; i < half; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const totalRows = Math.ceil(half / 2);
    const topBase = totalRows > 1 ? (compact ? 22 : 15) + (row / (totalRows - 1)) * 42 : 40;
    const topJitter = compact ? (col === 1 ? 3 : ((row % 2) * -2)) : (col === 1 ? 5 : ((row % 2) * -3));
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

function generateLoserPositions(count: number, compact = false): Array<{ top: string; left: string; rot: number }> {
  const positions: Array<{ top: string; left: string; rot: number }> = [];
  if (count === 0) return positions;
  const ring1N = Math.ceil(count * 0.6);
  const ring2N = count - ring1N;
  const rings = [
    { n: ring1N, r: compact ? 30 : 36, offset: 0 },
    { n: ring2N, r: compact ? 21 : 26, offset: Math.PI / 10 },
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

function generateAroundStarFinalPositions(count: number, compact = false): Array<{ top: string; left: string; rot: number }> {
  if (count === 0) return [];
  const centerX = 50;
  const centerY = compact ? 51 : 52;
  const radiusX = compact ? 35 : 39;
  const radiusY = compact ? 19 : 22;
  const start = Math.PI * 0.92;
  const end = Math.PI * 2.08;
  return Array.from({ length: count }, (_, i) => {
    const ratio = count === 1 ? 0.5 : i / (count - 1);
    const angle = start + (end - start) * ratio;
    return {
      top: `${(centerY + Math.sin(angle) * radiusY).toFixed(1)}%`,
      left: `${(centerX + Math.cos(angle) * radiusX).toFixed(1)}%`,
      rot: ((i * 13 + 4) % 18) - 9,
    };
  });
}

function getAroundStarOrbitPoint(angle: number, compact = false, radiusScale = 1) {
  const centerX = 50;
  const centerY = compact ? 53 : 54;
  const radiusX = (compact ? 38 : 43) * radiusScale;
  const radiusY = (compact ? 17 : 20) * radiusScale;
  return {
    top: `${(centerY + Math.sin(angle) * radiusY).toFixed(1)}%`,
    left: `${(centerX + Math.cos(angle) * radiusX).toFixed(1)}%`,
  };
}

function generateAroundStarAmbientPositions(count: number, compact = false): Array<{ top: string; left: string; rot: number }> {
  if (count === 0) return [];
  const cols = compact ? 5 : 7;
  const rows = Math.max(1, Math.ceil(count / cols));
  const topMin = compact ? 12 : 9;
  const topMax = compact ? 88 : 90;
  const leftMin = compact ? 8 : 6;
  const leftMax = compact ? 92 : 94;
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const colRatio = cols === 1 ? 0.5 : col / (cols - 1);
    const rowRatio = rows === 1 ? 0.5 : row / (rows - 1);
    let left = leftMin + colRatio * (leftMax - leftMin) + (((row * 13 + col * 7) % 7) - 3);
    let top = topMin + rowRatio * (topMax - topMin) + (((row * 11 + col * 5) % 9) - 4);

    // 중앙 그래프와 우승 얼굴 궤도 핵심부는 살짝 비워서 겹침을 줄인다.
    if (left > 33 && left < 67 && top > 34 && top < 70) {
      top += top < 52 ? -16 : 16;
      left += col < cols / 2 ? -10 : 10;
    }

    return {
      top: `${Math.max(6, Math.min(94, top)).toFixed(1)}%`,
      left: `${Math.max(4, Math.min(96, left)).toFixed(1)}%`,
      rot: ((i * 17 + 7) % 22) - 11,
    };
  });
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
export default function CeremonyPhotos({
  winners,
  losers,
  teamColors,
  width,
  height = 900,
  compact = false,
  effectPreset = DEFAULT_CEREMONY_EFFECT_PRESET,
  winnerLabel,
  winnerScore,
  isActive,
  onBurst,
}: CeremonyPhotosProps) {
  const [photoPhase, setPhotoPhase] = useState<PhotoPhase>('orbit');
  const [heroIndex, setHeroIndex] = useState(-1);
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [celebrationPhase, setCelebrationPhase] = useState<CelebrationPhase>('settling');
  const [aroundFocusIndex, setAroundFocusIndex] = useState(-1);
  const isSpotlightEffect = effectPreset === 'golden-spotlight';
  const isMountainEffect = effectPreset === 'mountain-cinema';
  const effectAccent = isSpotlightEffect ? '#FACC15' : '#FFD700';
  const effectAccentSoft = isSpotlightEffect ? 'rgba(250,204,21,0.45)' : 'rgba(255,215,0,0.35)';
  const effectGlow = isSpotlightEffect ? 'rgba(245,158,11,0.62)' : 'rgba(255,215,0,0.5)';

  // ─── Phase timer ───
  useEffect(() => {
    if (!isActive) {
      setPhotoPhase('orbit');
      setHeroIndex(-1);
      setCelebrationPhase('settling');
      setAroundFocusIndex(-1);
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
    setAroundFocusIndex(-1);

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

    const aroundFocusTimers: ReturnType<typeof setTimeout>[] = [];
    if (isMountainEffect) {
      const orbitDuration = 7.1;
      for (let idx = 0; idx < winnerCount; idx++) {
        const delay = 0.35 + idx * 0.54;
        aroundFocusTimers.push(setTimeout(() => setAroundFocusIndex(idx), (delay + orbitDuration * 0.58) * 1000));
      }
      aroundFocusTimers.push(setTimeout(() => setAroundFocusIndex(-1), (0.35 + Math.max(winnerCount - 1, 0) * 0.54 + orbitDuration * 0.9) * 1000));
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
      aroundFocusTimers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  if (!isActive) return null;

  const isCompact = compact || height < 720 || width < 1000;
  const allPhotos = [...losers.map(m => ({ ...m, isWinner: false })), ...winners.map(m => ({ ...m, isWinner: true }))];
  const loserPos = generateLoserPositions(losers.length, isCompact);
  const winPos = generateWinnerPositions(winners.length, isCompact);
  const loserSz = width < 768 ? 34 : isCompact ? 36 : 60;
  const winSz = width < 768 ? 64 : isCompact ? 72 : 140;

  if (isMountainEffect) {
    const aroundWinners = winners.length > 0 ? winners : allPhotos.filter(photo => photo.isWinner);
    const aroundLosers = losers.length > 0 ? losers : allPhotos.filter(photo => !photo.isWinner);
    const finalPos = generateAroundStarFinalPositions(aroundWinners.length, isCompact);
    const ambientPos = generateAroundStarAmbientPositions(aroundLosers.length, isCompact);
    const orbitSz = width < 768 ? 66 : isCompact ? 84 : 120;
    const ambientSz = width < 768 ? 28 : isCompact ? 34 : 48;
    const orbitCenterY = isCompact ? 52 : 54;
    const orbitOuterW = isCompact ? 82 : 84;
    const orbitOuterH = isCompact ? 40 : 43;
    const orbitInnerW = isCompact ? 68 : 70;
    const orbitInnerH = isCompact ? 31 : 34;
    const championTeam = (aroundWinners[0]?.team || 'BLUE') as Team;
    const championColor = teamColors[championTeam] ?? teamColors.BLUE;
    const championLabel = winnerLabel || championTeam;
    const championScore = typeof winnerScore === 'number' ? winnerScore.toLocaleString() : null;
    const orbitFirstDelay = 0.35;
    const orbitStagger = 0.54;
    const orbitDuration = 7.1;
    const lastOrbitDelay = orbitFirstDelay + Math.max(aroundWinners.length - 1, 0) * orbitStagger;
    const finalGatherAt = lastOrbitDelay + orbitDuration + 0.35;
    const finalBurstAt = finalGatherAt + 0.65;
    const finalSettleAt = finalBurstAt + 0.85;
    const finalBadgeDelay = finalSettleAt + 0.2;

    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'hidden',
        borderRadius: 24,
        perspective: 1200,
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.82, rotate: -8 }}
          animate={{ opacity: 0.52, scale: 1, rotate: 352 }}
          transition={{
            opacity: { duration: 1.4, ease: 'easeOut' },
            scale: { duration: 2.4, ease: 'easeOut' },
            rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
          }}
          style={{
            position: 'absolute',
            top: `${orbitCenterY - orbitOuterH / 2}%`,
            left: `${(100 - orbitOuterW) / 2}%`,
            width: `${orbitOuterW}%`,
            height: `${orbitOuterH}%`,
            borderRadius: '50%',
            border: '3px solid rgba(250,204,21,0.42)',
            boxShadow: `0 0 34px rgba(250,204,21,0.26), inset 0 0 22px ${championColor.glow}`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(250,204,21,0.18) 48%, rgba(255,255,255,0.34) 50%, rgba(250,204,21,0.18) 52%, transparent 100%)',
            zIndex: 1,
          }}
        />
        <motion.div
          initial={{ opacity: 0, rotate: 12 }}
          animate={{ opacity: 0.62, rotate: -348 }}
          transition={{
            opacity: { duration: 1.6, ease: 'easeOut' },
            rotate: { duration: 24, repeat: Infinity, ease: 'linear' },
          }}
          style={{
          position: 'absolute',
          top: `${orbitCenterY - orbitInnerH / 2}%`,
          left: `${(100 - orbitInnerW) / 2}%`,
          width: `${orbitInnerW}%`,
          height: `${orbitInnerH}%`,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.28)',
          boxShadow: '0 0 22px rgba(255,255,255,0.15)',
          zIndex: 1,
        }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.5, 0.24], scale: [0.7, 1.1, 1] }}
          transition={{ duration: 5.2, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: isCompact ? '52%' : '54%',
            left: '50%',
            width: isCompact ? 260 : 380,
            height: isCompact ? 260 : 380,
            marginLeft: isCompact ? -130 : -190,
            marginTop: isCompact ? -130 : -190,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,0.34) 0%, ${championColor.glow} 36%, transparent 70%)`,
            filter: 'blur(10px)',
            zIndex: 0,
          }}
        />

        {ambientPos.map((pos, i) => {
          const p = aroundLosers[i];
          if (!p) return null;
          const tc = teamColors[p.team as Team];
          return (
            <motion.div
              key={`around-ambient-${i}`}
              initial={{ top: '52%', left: '50%', scale: 0.35, opacity: 0, rotate: pos.rot - 14 }}
              animate={{
                top: pos.top,
                left: pos.left,
                scale: [0.86, 1.03, 0.94],
                opacity: [0, 0.22 + (i % 4) * 0.025, 0.14 + (i % 3) * 0.03],
                rotate: pos.rot,
              }}
              transition={{
                top: { duration: 1.8, delay: 0.4 + i * 0.045, ease: [0.16, 1, 0.3, 1] },
                left: { duration: 1.8, delay: 0.4 + i * 0.045, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 5.2 + (i % 3) * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 },
                opacity: { duration: 4.8 + (i % 4) * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 + i * 0.06 },
                rotate: { duration: 1.8, delay: 0.4 + i * 0.045, ease: 'easeOut' },
              }}
              style={{
                position: 'absolute',
                width: ambientSz,
                height: ambientSz,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                overflow: 'hidden',
                border: `2px solid ${tc.bg}55`,
                boxShadow: `0 0 16px ${tc.glow}`,
                filter: 'grayscale(0.25) saturate(0.7) brightness(0.82)',
                zIndex: 2,
              }}
            >
              {renderAvatar(p.avatar_url, p.name, ambientSz, tc)}
            </motion.div>
          );
        })}

        {aroundWinners.map((p, i) => {
          if (!p) return null;
          const tc = teamColors[p.team as Team];
          const pos = finalPos[i];
          const isFocused = aroundFocusIndex === i;
          const orbitAngle = (i / Math.max(aroundWinners.length, 1)) * Math.PI * 2 - Math.PI * 0.62;
          const rear = getAroundStarOrbitPoint(orbitAngle + Math.PI * 0.85, isCompact, 1.08);
          const side = getAroundStarOrbitPoint(orbitAngle + Math.PI * 1.55, isCompact, 1.14);
          const front = getAroundStarOrbitPoint(orbitAngle + Math.PI * 2.2, isCompact, 1.02);
          const frontHold = getAroundStarOrbitPoint(orbitAngle + Math.PI * 2.33, isCompact, 1.02);
          const startLeft = i % 2 === 0 ? `${-12 - (i % 3) * 5}%` : `${112 + (i % 3) * 5}%`;
          const startTop = `${70 + (i * 13) % 24}%`;
          const delay = orbitFirstDelay + i * orbitStagger;
          const duration = finalSettleAt - delay;
          const finalTopNumber = parseFloat(pos.top);
          const finalLeftNumber = parseFloat(pos.left);
          const centerTop = `${orbitCenterY}%`;
          const centerLeft = '50%';
          const burstTop = `${(orbitCenterY + (finalTopNumber - orbitCenterY) * 1.24).toFixed(1)}%`;
          const burstLeft = `${(50 + (finalLeftNumber - 50) * 1.18).toFixed(1)}%`;
          const toLocalTime = (absoluteSecond: number) => Math.max(0, Math.min(1, (absoluteSecond - delay) / duration));
          return (
            <motion.div
              key={`around-star-${i}`}
              initial={{
                top: startTop,
                left: startLeft,
                scale: 2.7,
                opacity: 0,
                rotate: pos.rot + (i % 2 === 0 ? -28 : 28),
              }}
              animate={{
                top: [startTop, rear.top, side.top, front.top, frontHold.top, pos.top, centerTop, burstTop, pos.top],
                left: [startLeft, rear.left, side.left, front.left, frontHold.left, pos.left, centerLeft, burstLeft, pos.left],
                scale: [2.7, 0.46, 1.1, 3.05, 3.16, 1, 0.34, 1.62, 1],
                opacity: [0, 0.42, 0.84, 1, 1, 1, 1, 1, 1],
                rotate: [pos.rot - 40, pos.rot - 12, pos.rot + 8, pos.rot + 21, pos.rot + 14, pos.rot, pos.rot - 8, pos.rot + 12, pos.rot],
              }}
              transition={{
                duration,
                delay,
                ease: [0.16, 1, 0.3, 1],
                times: [
                  0,
                  toLocalTime(delay + orbitDuration * 0.17),
                  toLocalTime(delay + orbitDuration * 0.4),
                  toLocalTime(delay + orbitDuration * 0.63),
                  toLocalTime(delay + orbitDuration * 0.82),
                  toLocalTime(delay + orbitDuration),
                  toLocalTime(finalGatherAt),
                  toLocalTime(finalBurstAt),
                  1,
                ],
              }}
              style={{
                position: 'absolute',
                width: orbitSz,
                height: orbitSz,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: isFocused ? 120 : 30 + i,
                transformStyle: 'preserve-3d',
              }}
            >
              <motion.div
                animate={{ opacity: [0, 0.18, 0.55, 0.32, 0], scaleX: [0.4, 1.1, 1.9, 1.3, 0.6] }}
                transition={{ duration, delay, ease: 'easeInOut', times: [0, 0.24, 0.5, 0.76, 1] }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '54%',
                  width: orbitSz * 1.85,
                  height: Math.max(8, orbitSz * 0.16),
                  transform: 'translateY(-50%) rotate(-13deg)',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 45%, rgba(250,204,21,0.58) 72%, transparent 100%)',
                  filter: 'blur(4px)',
                  transformOrigin: 'right center',
                  zIndex: -1,
                }}
              />
              <motion.div
                animate={{ y: [0, -6, 0], scale: [1, 1.05, 1] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.13 + 6.8 }}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: `4px solid ${championColor.mid}`,
                  boxShadow: `0 0 32px rgba(250,204,21,0.68), 0 14px 30px rgba(0,0,0,0.34), 0 0 18px ${tc.glow}`,
                  background: '#0f172a',
                }}
              >
                {renderAvatar(p.avatar_url, p.name, orbitSz, tc, true)}
              </motion.div>
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 5,
                padding: '2px 8px',
                borderRadius: 999,
                background: `linear-gradient(135deg, ${championColor.bg}, ${championColor.dark})`,
                color: '#fff7ed',
                border: '1px solid rgba(250,204,21,0.55)',
                fontSize: width < 768 ? '0.5rem' : isCompact ? '0.62rem' : '0.78rem',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
              }}>{p.name}</div>
            </motion.div>
          );
        })}

        <motion.div
          initial={{ scale: 0.35, opacity: 0 }}
          animate={{ scale: [0.35, 1.55, 2.55], opacity: [0, 0.58, 0] }}
          transition={{ duration: 1.15, delay: finalGatherAt, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: `${orbitCenterY}%`,
            left: '50%',
            width: isCompact ? 150 : 220,
            height: isCompact ? 150 : 220,
            marginLeft: isCompact ? -75 : -110,
            marginTop: isCompact ? -75 : -110,
            borderRadius: '50%',
            border: `3px solid ${championColor.mid}`,
            boxShadow: `0 0 40px rgba(250,204,21,0.4), inset 0 0 24px ${championColor.glow}`,
            zIndex: 90,
          }}
        />
        <motion.div
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 3.1], opacity: [0.76, 0] }}
          transition={{ duration: 0.82, delay: finalBurstAt, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: `${orbitCenterY}%`,
            left: '50%',
            width: isCompact ? 64 : 90,
            height: isCompact ? 64 : 90,
            marginLeft: isCompact ? -32 : -45,
            marginTop: isCompact ? -32 : -45,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(255,255,255,0.88) 0%, ${championColor.mid} 32%, transparent 70%)`,
            zIndex: 92,
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.84 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: finalBadgeDelay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: isCompact ? '6%' : '7%',
            transform: 'translateX(-50%)',
            zIndex: 12,
            minWidth: width < 768 ? 210 : isCompact ? 260 : 360,
            padding: width < 768 ? '8px 18px' : isCompact ? '9px 24px' : '12px 36px',
            borderRadius: 28,
            background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.68))',
            border: `2px solid ${championColor.mid}`,
            color: '#FEF3C7',
            textAlign: 'center',
            boxShadow: `0 0 42px rgba(250,204,21,0.28), 0 0 30px ${championColor.glow}`,
          }}
        >
          <div style={{
            fontFamily: "'Noto Sans KR', sans-serif",
            fontSize: width < 768 ? '0.62rem' : isCompact ? '0.72rem' : '0.9rem',
            fontWeight: 900,
            color: '#FDE68A',
            letterSpacing: 4,
            marginBottom: 2,
          }}>
            최종 우승
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: width < 768 ? 8 : 14,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: width < 768 ? '1rem' : isCompact ? '1.2rem' : '1.55rem',
              filter: 'drop-shadow(0 0 12px rgba(250,204,21,0.72))',
            }}>🏆</span>
            <span style={{
              fontFamily: "'Black Han Sans', sans-serif",
              fontSize: width < 768 ? '1.55rem' : isCompact ? '2rem' : '2.7rem',
              color: championColor.mid,
              letterSpacing: width < 768 ? 3 : 6,
              textShadow: `0 0 30px ${championColor.glow}, 0 2px 8px rgba(0,0,0,0.35)`,
            }}>
              {championLabel}
            </span>
            {championScore && (
              <span style={{
                fontFamily: "'Black Han Sans', sans-serif",
                fontSize: width < 768 ? '0.9rem' : isCompact ? '1.05rem' : '1.35rem',
                color: championColor.dark,
                background: championColor.light,
                border: `2px solid ${championColor.mid}`,
                borderRadius: 999,
                padding: width < 768 ? '3px 9px' : '4px 14px',
                boxShadow: `0 0 18px ${championColor.glow}`,
              }}>
                {championScore}점
              </span>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

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
        const sz = isW ? (width < 768 ? 58 : isCompact ? 66 : 90) : (width < 768 ? 34 : isCompact ? 38 : 55);
        const directions = [
          { x: -500, y: (i * 73 % 200) - 100 },
          { x: 500, y: (i * 73 % 200) - 100 },
          { x: (i * 97 % 300) - 150, y: -400 },
          { x: (i * 97 % 300) - 150, y: 400 },
        ];
        const dir = directions[i % 4];
        const floatScale = isSpotlightEffect ? 0.72 : 1;
        const floatX = Math.cos(i * 2.39) * (width < 768 ? 48 : isCompact ? 76 : 120) * floatScale;
        const floatY = Math.sin(i * 2.39) * (width < 768 ? 32 : isCompact ? 48 : 80) * floatScale;
        return (
          <motion.div key={`orbit-${i}`}
            initial={{ x: dir.x, y: dir.y, scale: 0.1, opacity: 0, rotate: (i * 47 % 360) - 180 }}
            animate={{ x: floatX, y: floatY, scale: isW ? (isSpotlightEffect ? 1 : 0.9) : (isSpotlightEffect ? 0.45 : 0.6), opacity: isW ? 1 : (isSpotlightEffect ? 0.28 : 0.5), rotate: 0 }}
            transition={{ type: 'spring', stiffness: 60 + (i * 13 % 40), damping: 12 + (i * 7 % 5), delay: i * 0.08 }}
            style={{
              position: 'absolute', top: '50%', left: '50%', marginLeft: -sz / 2, marginTop: -sz / 2,
              width: sz, height: sz, borderRadius: '50%', zIndex: isW ? 3 : 1, pointerEvents: 'none',
            }}
          >
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
              border: isW ? `3px solid ${isSpotlightEffect ? effectAccent : tc.bg}` : `1.5px solid ${isSpotlightEffect ? effectAccent : tc.bg}66`,
              boxShadow: isW
                ? `0 0 18px ${isSpotlightEffect ? effectGlow : tc.glow}`
                : `0 0 6px ${isSpotlightEffect ? 'rgba(245,158,11,0.24)' : tc.glow}`,
              filter: isW ? 'none' : `brightness(${isSpotlightEffect ? 0.6 : 0.8}) saturate(${isSpotlightEffect ? 0.35 : 0.6})`,
            }}>
              {renderAvatar(photo.avatar_url, photo.name, sz, tc, true)}
            </div>
            {isW && (
              <div style={{
                position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                background: isSpotlightEffect ? 'rgba(15,23,42,0.82)' : `${tc.bg}CC`, color: '#fff',
                fontSize: width < 768 ? '0.42rem' : isCompact ? '0.5rem' : '0.6rem', fontWeight: 700,
                padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap',
                border: isSpotlightEffect ? `1px solid ${effectAccent}` : undefined,
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
          background: isSpotlightEffect
            ? 'radial-gradient(circle, rgba(250,204,21,0.5) 0%, rgba(255,255,255,0.22) 36%, transparent 68%)'
            : 'radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(147,51,234,0.15) 50%, transparent 70%)',
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
                  transform: `rotate(${pos.rot}deg)`, border: `2px solid ${isSpotlightEffect ? effectAccent : tc.bg}44`,
                  boxShadow: `0 0 4px ${isSpotlightEffect ? 'rgba(245,158,11,0.22)' : tc.glow}`,
                  filter: `brightness(${isSpotlightEffect ? 0.55 : 0.7}) saturate(${isSpotlightEffect ? 0.35 : 0.5})`,
                }}>
                  {renderAvatar(p.avatar_url, p.name, loserSz, tc)}
                </div>
                <div style={{
                  position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                  background: isSpotlightEffect ? 'rgba(15,23,42,0.55)' : `${tc.bg}88`, color: '#fff', fontSize: width < 768 ? '0.36rem' : isCompact ? '0.42rem' : '0.5rem',
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
                            `0 0 25px ${effectGlow}, 0 0 40px ${isSpotlightEffect ? effectAccentSoft : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 50px ${effectGlow}, 0 0 70px ${isSpotlightEffect ? 'rgba(255,255,255,0.45)' : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 25px ${effectGlow}, 0 0 40px ${isSpotlightEffect ? effectAccentSoft : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                          ]
                        : [
                            `0 0 15px ${effectAccentSoft}, 0 0 24px ${isSpotlightEffect ? effectGlow : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 35px ${effectGlow}, 0 0 48px ${isSpotlightEffect ? 'rgba(255,255,255,0.32)' : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                            `0 0 15px ${effectAccentSoft}, 0 0 24px ${isSpotlightEffect ? effectGlow : tc.glow}, 0 8px 20px rgba(0,0,0,0.3)`,
                          ],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
                      transform: `rotate(${pos.rot}deg)`, border: `4px solid ${isSpotlightEffect ? effectAccent : tc.bg}`,
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
                      background: `radial-gradient(circle, ${isSpotlightEffect ? effectGlow : tc.glow} 0%, transparent 70%)`,
                      pointerEvents: 'none',
                    }}
                  />
                )}

                <div style={{
                  position: 'absolute', top: '100%', marginTop: 4, left: '50%', transform: 'translateX(-50%)',
                  background: isSpotlightEffect
                    ? 'linear-gradient(135deg, #111827, #374151)'
                    : `linear-gradient(135deg, ${tc.bg}, ${tc.dark})`, color: '#fff',
                  fontSize: width < 768 ? '0.55rem' : isCompact ? '0.68rem' : '0.85rem', fontWeight: 800,
                  padding: '2px 8px', borderRadius: 8, boxShadow: `0 2px 8px ${isSpotlightEffect ? 'rgba(245,158,11,0.5)' : tc.glow}`,
                  border: isSpotlightEffect ? `2px solid ${effectAccent}` : undefined,
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
                border: `2px solid ${isSpotlightEffect ? 'rgba(255,255,255,0.62)' : 'rgba(255,215,0,0.5)'}`, pointerEvents: 'none', zIndex: 40,
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
                background: isSpotlightEffect
                  ? 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(250,204,21,0.35), transparent)'
                  : 'linear-gradient(180deg, rgba(255,215,0,0.8), transparent)',
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
                  background: i % 2 === 0 ? effectAccent : (isSpotlightEffect ? '#FFFFFF' : '#FFA500'),
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
                const colors = isSpotlightEffect
                  ? ['#FEF3C7', '#FACC15', '#F59E0B', '#FFFFFF', '#BFDBFE', '#2563EB']
                  : ['#FFD700', '#FFA500', '#FF69B4', '#9333EA', '#22C55E', '#3B82F6', '#EF4444'];
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
                  background: isSpotlightEffect
                    ? 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(250,204,21,0.45) 38%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(255,215,0,0.6) 0%, rgba(255,165,0,0.3) 40%, transparent 70%)',
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
