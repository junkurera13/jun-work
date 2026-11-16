// A quiet, looping soundscape for each weather. Sounds are loaded on demand,
// and the old weather fades into the new one instead of cutting abruptly.
const TRACKS = ["snow", "rain", "breeze", "sunshine", "heatwave"];
const LEVEL = 0.22;
const FADE_SECONDS = 1.2;

export class WeatherAudio {
  constructor(getContext, value) {
    this.getContext = getContext;
    this.value = value;
    this.enabled = false;
    this.hidden = document.hidden;
    this.current = null;
    this.tracks = new Set();
    this.buffers = new Map();
    this.version = 0;
  }

  async bufferFor(index, ctx) {
    if (!this.buffers.has(index)) {
      const path = `/audio/weather/${TRACKS[index]}.mp3`;
      const pending = fetch(path)
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load ${path}`);
          return response.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .catch((error) => {
          this.buffers.delete(index);
          throw error;
        });
      this.buffers.set(index, pending);
    }
    return this.buffers.get(index);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.play();
  }

  setWeather(index) {
    this.value = index;
    // Invalidate a pending decode even when returning to the current track.
    ++this.version;
    if (this.enabled && !this.hidden) this.play();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && !this.hidden) this.play();
    else this.stop();
  }

  setHidden(hidden) {
    this.hidden = hidden;
    if (hidden) this.stop();
    else if (this.enabled) this.play();
  }

  async play() {
    if (!this.enabled || this.hidden) return;
    const index = this.value;
    if (this.current?.index === index) return;
    const version = ++this.version;
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const buffer = await this.bufferFor(index, ctx);
      if (version !== this.version || !this.enabled || this.hidden) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(LEVEL, now + FADE_SECONDS);
      source.connect(gain).connect(ctx.destination);
      const track = { index, source, gain };
      source.onended = () => {
        this.tracks.delete(track);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
      this.tracks.add(track);
      if (this.current) this.fadeOut(this.current, ctx);
      this.current = track;
    } catch (error) {
      if (version === this.version) {
        this.stop();
        console.warn("Weather sound unavailable:", error);
      }
    }
  }

  fadeOut(track, ctx, duration = FADE_SECONDS) {
    const now = ctx.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(0, now + duration);
    track.source.stop(now + duration + 0.05);
  }

  stop() {
    ++this.version;
    if (this.tracks.size === 0) return;
    const ctx = this.getContext();
    // A previous track may still be crossfading when mute is pressed.
    for (const track of this.tracks) this.fadeOut(track, ctx, 0.2);
    this.current = null;
  }
}
