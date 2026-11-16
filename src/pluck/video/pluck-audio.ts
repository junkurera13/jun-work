/**
 * The sound of the strings.
 *
 * Each pluck is synthesised with Karplus–Strong: a burst of noise fed round a delay line one period long, averaged a
 * little on every pass, so the high partials die first and what is left is a plucked string. Nothing is downloaded.
 *
 * Pitch follows the physics the string is drawn with. The timeline is stopped at every chapter, the way a fret stops
 * a guitar string, so a short chapter sounds higher than a long one. The volume string is tuned by its tension: louder
 * is tighter is higher. Every note is rounded to a minor pentatonic scale so that scrubbing across chapters always
 * plays something that sounds intended.
 *
 * Sound follows the player: muted or at zero volume, the strings are silent. The viewer can also turn it off with the
 * string-sound button, and the choice is remembered.
 */

const NAMES = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
/** A minor pentatonic, in semitones above A. */
const SCALE = [0, 3, 5, 7, 10];
const STORAGE_KEY = 'pluck:string-sound';
const SECONDS = 1.6;

export interface Note {
  frequency: number;
  name: string;
}

interface Voice {
  muted: boolean;
  volume: number;
}

let context: AudioContext | null = null;
let output: AudioNode | null = null;
const buffers = new Map<number, AudioBuffer>();
const listeners = new Set<(on: boolean) => void>();

function readSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = readSetting();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;

  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }

  for (const listener of listeners) listener(on);

  // The toggle is clicked, so this runs inside a gesture.
  if (on) unlock();
}

export function onSoundChange(listener: (on: boolean) => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** The nearest note of the scale, and its name. */
export function noteFor(frequency: number): Note {
  const semitones = Math.round(12 * Math.log2(frequency / 440));
  let best = semitones;

  for (let offset = 0; offset < 6; offset++) {
    const up = semitones + offset;
    const down = semitones - offset;

    if (SCALE.includes(((up % 12) + 12) % 12)) {
      best = up;
      break;
    }

    if (SCALE.includes(((down % 12) + 12) % 12)) {
      best = down;
      break;
    }
  }

  const midi = 69 + best;

  return {
    frequency: 440 * 2 ** (best / 12),
    name: `${NAMES[((best % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`,
  };
}

function bufferFor(audio: AudioContext, frequency: number): AudioBuffer {
  const key = Math.round(frequency * 10);
  const cached = buffers.get(key);

  if (cached) return cached;

  const rate = audio.sampleRate;
  const period = Math.max(2, Math.round(rate / frequency));
  const buffer = audio.createBuffer(1, Math.floor(rate * SECONDS), rate);
  const data = buffer.getChannelData(0);
  const line = new Float32Array(period);

  // A softened burst: noise, smoothed once, so the attack is a pluck and not a click.
  let previous = 0;

  for (let index = 0; index < period; index++) {
    const noise = Math.random() * 2 - 1;

    previous = previous * 0.35 + noise * 0.65;
    line[index] = previous;
  }

  // Higher notes lose energy faster, as they do on a real string.
  const damping = 0.996 - Math.min(frequency / 40000, 0.012);

  for (let index = 0, cursor = 0; index < data.length; index++) {
    const next = (cursor + 1) % period;
    const value = line[cursor]!;

    data[index] = value;
    line[cursor] = damping * 0.5 * (value + line[next]!);
    cursor = next;
  }

  // A short fade at the end so the tail never clicks.
  const fade = Math.floor(rate * 0.05);

  for (let index = 0; index < fade; index++) data[data.length - 1 - index]! *= index / fade;

  buffers.set(key, buffer);

  return buffer;
}

/** The shared audio context, with one limiter in front of the speakers so no pluck ever clips. */
function ensureContext(): AudioContext | null {
  if (context) return context;

  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Context) return null;

  try {
    context = new Context();
  } catch {
    return null;
  }

  const limiter = context.createDynamicsCompressor();

  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(context.destination);
  output = limiter;

  return context;
}

/**
 * Safari (iOS above all) only lets a page start audio from inside a tap, click or key handler. Plucks are sounded
 * from the animation loop, a frame after the gesture, so the context is woken here instead: on the first gesture
 * anywhere on the page, with a silent sample, which is what iOS needs to let later sound through.
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

function unlock(): void {
  if (!enabled) return;

  const audio = ensureContext();

  if (!audio) return;

  if (audio.state !== 'running') {
    void audio.resume();

    const silence = audio.createBufferSource();

    silence.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    silence.connect(audio.destination);
    silence.start(0);
  }

  if (audio.state === 'running') stopListening();
}

function stopListening(): void {
  for (const type of UNLOCK_EVENTS) document.removeEventListener(type, unlock, true);
}

if (typeof document !== 'undefined') {
  for (const type of UNLOCK_EVENTS) document.addEventListener(type, unlock, { capture: true, passive: true });
}

function hasUserGesture(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;

  return activation ? activation.hasBeenActive : true;
}

/**
 * Pluck a note.
 *
 * @param frequency - Already on the scale; see {@link noteFor}.
 * @param strength - 0 to 1: how hard the string was pulled.
 * @param voice - The player's media, for mute and volume. Its own volume is applied on top.
 * @param pan - -1 (left) to 1 (right): where along the player the pluck happened.
 */
export function pluckSound(frequency: number, strength: number, voice: Voice | null, pan = 0): void {
  if (!enabled || !hasUserGesture()) return;
  if (voice && (voice.muted || voice.volume <= 0)) return;

  const audio = ensureContext();

  if (!audio || !output) return;

  const destination = output;

  if (audio.state !== 'running') void audio.resume();

  const now = audio.currentTime;
  // Even a light pluck should be heard over the film; a hard one is about twice as loud.
  const level = 0.45 + 0.55 * Math.min(Math.max(strength, 0), 1);
  const source = audio.createBufferSource();
  const tone = audio.createBiquadFilter();
  const gain = audio.createGain();

  source.buffer = bufferFor(audio, frequency);

  // A harder pluck is brighter as well as louder.
  tone.type = 'lowpass';
  tone.frequency.value = 900 + level * 5200;
  tone.Q.value = 0.4;

  gain.gain.setValueAtTime(0.9 * level * (voice ? Math.sqrt(voice.volume) : 1), now);

  source.connect(tone);
  tone.connect(gain);

  if (typeof audio.createStereoPanner === 'function') {
    const panner = audio.createStereoPanner();

    panner.pan.value = Math.min(Math.max(pan, -1), 1) * 0.6;
    gain.connect(panner);
    panner.connect(destination);
  } else {
    gain.connect(destination);
  }

  source.start(now);
  source.stop(now + SECONDS);
}
