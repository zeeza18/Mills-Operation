let audioCtx: AudioContext | null = null;
let activeOscillator: OscillatorNode | null = null;

function getContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

// Browsers block audio until a user gesture unlocks the AudioContext. Called
// from a one-time click/keydown listener in App.tsx so sound works without a
// dedicated "enable sound" button.
export function unlockAudio() {
  const ctx = getContext();
  if (ctx.state === "suspended") void ctx.resume();
}

// A synthesized wailing siren, no audio asset needed: sweeps up and down
// repeatedly over several seconds, like a sustained emergency siren, instead
// of a short notification chirp.
//
// Async and resumes the AudioContext itself before scheduling anything.
// speechSynthesis (announceAlert below) is a separate browser API not
// gated by AudioContext state, which is why the spoken announcement could
// work while this stayed silent or got clipped: if this fired while the
// context was still "suspended" (the default until a user gesture unlocks
// it), scheduling times computed from ctx.currentTime before resume
// completes are unreliable, since the context's clock doesn't advance while
// suspended. Waiting on resume() first fixes that instead of just hoping the
// one-time click/keydown listener in App.tsx already ran before this fires.
export async function playSiren() {
  const ctx = getContext();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return; // still no user gesture to unlock audio; nothing more we can do
    }
  }

  const now = ctx.currentTime;
  const cycleLen = 0.7; // one up-down sweep
  const cycles = 4; // ~2.8s of sustained wail per trigger, not a quick blip
  const duration = cycleLen * cycles;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";

  osc.frequency.setValueAtTime(500, now);
  for (let i = 1; i <= cycles; i++) {
    const t = now + cycleLen * i;
    osc.frequency.linearRampToValueAtTime(i % 2 === 1 ? 1000 : 500, t);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.14, now + 0.05);
  gain.gain.setValueAtTime(0.14, now + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
  osc.addEventListener("ended", () => {
    if (activeOscillator === osc) activeOscillator = null;
  });
  activeOscillator = osc;
}

// Immediately cuts off whatever's currently playing: the in-progress siren
// wail (which otherwise runs its full ~2.8s regardless of muting) and any
// queued or in-progress spoken announcement. Muting was previously "stop
// firing new alerts", not "stop the one already playing", which read as the
// mute button not working if you hit it mid-wail.
export function stopAlertSound() {
  if (activeOscillator) {
    try {
      activeOscillator.stop();
    } catch {
      // already stopped; nothing to do
    }
    activeOscillator = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function standLabel(standId: string): string {
  // "STAND-01" -> "roll stand 1"
  const match = standId.match(/^STAND-0*(\d+)$/i);
  if (match) return `roll stand ${match[1]}`;
  // the degradation simulator's virtual stand isn't part of the numbered
  // fleet, but "sim stand" reads oddly out loud, so it gets a friendly
  // stand-in number instead
  if (standId === "SIM-STAND") return "roll stand 1";
  return `roll stand ${standId.toLowerCase().replace(/-/g, " ")}`;
}

// Speaks which stands are in alert, e.g. "Warning. Stand 1 and stand 6 in
// alert." Uses the browser's built-in speech synthesis, no audio asset or
// backend call needed. Silently does nothing if the browser doesn't support
// it, since this is a supplementary cue on top of the siren, not the only
// way to know something is wrong.
export function announceAlert(standIds: string[]) {
  if (standIds.length === 0 || !("speechSynthesis" in window)) return;

  const labels = standIds.map(standLabel);
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  const utterance = new SpeechSynthesisUtterance(`Warning. ${list} in alert.`);
  utterance.rate = 1;
  utterance.pitch = 0.9;
  window.speechSynthesis.speak(utterance);
}
