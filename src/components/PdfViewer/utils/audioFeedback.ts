// ---- 페이지 넘기는 소리 (Web Audio API) ----
let audioCtxCache: AudioContext | null = null;

export function playPageTurnSound(): void {
  try {
    if (!audioCtxCache) audioCtxCache = new AudioContext();
    const ctx = audioCtxCache;
    if (ctx.state === 'suspended') ctx.resume();

    const duration = 0.25;
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const envelope = t < 0.2 ? t / 0.2 : Math.exp(-(t - 0.2) * 6);
      const crackle = Math.random() > 0.97 ? (Math.random() - 0.5) * 3 : 0;
      data[i] = ((Math.random() * 2 - 1) + crackle) * envelope * 0.08;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 4000;
    bandpass.Q.value = 0.8;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 800;

    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(ctx.destination);
    source.start();
  } catch {
    // 오디오 에러 무시
  }
}
