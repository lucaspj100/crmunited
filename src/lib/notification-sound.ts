// Alerta sonoro para notificações de retorno (Web Audio API)
const LS_KEY = "return_sound_enabled";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isReturnSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LS_KEY) === "1";
}

export async function enableReturnSound(): Promise<boolean> {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    // toca um beep mudo para "destravar" a política de autoplay
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.05);
    window.localStorage.setItem(LS_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function disableReturnSound() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY);
}

function beep(ctx: AudioContext, when: number, freq: number, durMs: number, volume = 0.15) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  const dur = durMs / 1000;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(volume, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(ctx.destination);
  o.start(when);
  o.stop(when + dur + 0.02);
}

export async function playReturnSound(): Promise<boolean> {
  if (!isReturnSoundEnabled()) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const t0 = ctx.currentTime;
    beep(ctx, t0, 880, 180);
    beep(ctx, t0 + 0.22, 1175, 220);
    return true;
  } catch {
    return false;
  }
}
