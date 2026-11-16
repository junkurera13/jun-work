/**
 * `<pluck-string>` draws a slider's track as a string.
 *
 * It lives inside `<media-time-slider>` or `<media-volume-slider>`, which stays the real control and owns the
 * keyboard, the pointer, the ARIA value and the change. This element only draws and sounds, and is hidden from
 * assistive technology.
 *
 * The timeline is a guitar string laid across the player: wound bronze where it has been played, plain steel ahead,
 * a slide at the playhead, and a fret at every chapter. The volume string stands on end and is tuned by its tension.
 *
 * The pointer bends the span it is over; dragging pulls it further. On release that span rings and settles. The
 * motion is the textbook plucked string: a triangle let go at the pluck point, summed from its first harmonics, each
 * decaying faster than the one below. A short span rings faster than a long one. Seeking from the keyboard plucks it
 * too, so the feedback is not only for the mouse.
 */

import { type Note, noteFor, pluckSound } from './pluck-audio';

const SVG = 'http://www.w3.org/2000/svg';
const HARMONICS = 9;
/** Cycles per second of the lowest harmonic of the whole string. Far slower than real, so the eye can follow it. */
const FREQUENCY = 4.4;
/** Decay per second of the lowest harmonic; harmonic n decays n times as fast. */
const DECAY = 4.2;
const HOVER_PULL = 10;
const DRAG_PULL = 28;
const KEY_PLUCK = 9;
const STEP = 4;
/** The open timeline is tuned to A2; frets shorten it from there. */
const OPEN_STRING = 110;

interface Ring {
  start: number;
  from: number;
  to: number;
  at: number;
  height: number;
  speed: number;
}

interface Voice {
  muted: boolean;
  volume: number;
}

function percent(value: string): number {
  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? Math.min(Math.max(number / 100, 0), 1) : 0;
}

function make<Name extends keyof SVGElementTagNameMap>(name: Name, className: string): SVGElementTagNameMap[Name] {
  const element = document.createElementNS(SVG, name);

  element.setAttribute('class', className);

  return element;
}

class PluckStringElement extends HTMLElement {
  #svg = make('svg', 'pluck-string-svg');
  #rest = make('path', 'pluck-string-rest');
  #buffer = make('path', 'pluck-string-buffer');
  #played = make('path', 'pluck-string-played');
  #winding = make('path', 'pluck-string-winding');
  #frets = make('g', 'pluck-string-frets');
  #slide = make('rect', 'pluck-string-slide');
  #slider: HTMLElement | null = null;
  #note: HTMLElement | null = null;
  #volume = false;
  #frame = 0;
  #length = 0;
  #thickness = 0;
  #pinsAt: number[] = [0, 1];
  #pull = 0;
  #pullAt = 0.5;
  #offset = 0;
  #held = false;
  #dragged = false;
  #fill = Number.NaN;
  #lastTick = 0;
  #rings: Ring[] = [];
  #still = false;
  #signature = '';
  #noteName = '';
  #calm = matchMedia('(prefers-reduced-motion: reduce)');
  #resizeObserver = new ResizeObserver(() => this.#measure());
  #chapterObserver = new MutationObserver(() => this.#readPins());

  connectedCallback(): void {
    this.setAttribute('aria-hidden', 'true');
    this.#svg.setAttribute('focusable', 'false');

    if (!this.#svg.isConnected) {
      this.#svg.append(this.#rest, this.#buffer, this.#played, this.#winding, this.#frets, this.#slide);
      this.append(this.#svg);
    }

    this.#slider = this.closest('media-time-slider, media-volume-slider');
    this.#volume = this.#slider?.localName === 'media-volume-slider';
    this.toggleAttribute('data-vertical', this.#volume);
    this.#note = this.#slider?.querySelector('.pluck-note') ?? null;
    this.#slider?.addEventListener('pointermove', this.#onPointer, { passive: true });
    this.#slider?.addEventListener('pointerdown', this.#onPointer, { passive: true });

    const chapters = this.#slider?.querySelector('media-time-slider-chapters');

    if (chapters) {
      this.#chapterObserver.observe(chapters, { childList: true, attributes: true, attributeFilter: ['style'], subtree: true });
    }

    this.#resizeObserver.observe(this);
    this.#measure();
    this.#readPins();
    this.#tick();
  }

  disconnectedCallback(): void {
    this.#slider?.removeEventListener('pointermove', this.#onPointer);
    this.#slider?.removeEventListener('pointerdown', this.#onPointer);
    this.#resizeObserver.disconnect();
    this.#chapterObserver.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  /** How far the pointer is to the side of the string. Up (or left, for the volume string) is negative. */
  #onPointer = (event: PointerEvent): void => {
    const rect = this.getBoundingClientRect();

    this.#offset = this.#volume
      ? event.clientX - (rect.left + rect.width / 2)
      : event.clientY - (rect.top + rect.height / 2);
  };

  #voice(): Voice | null {
    const media = this.closest('media-container')?.querySelector<HTMLMediaElement>('mux-video, video, audio');

    return media ? { muted: media.muted, volume: media.volume } : null;
  }

  #measure(): void {
    const width = this.clientWidth;
    const height = this.clientHeight;

    this.#length = this.#volume ? height : width;
    this.#thickness = this.#volume ? width : height;
    this.#svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.#drawFrets();
    this.#signature = '';
  }

  /** Chapters fret the string. Each chapter element carries its start as a percentage. */
  #readPins(): void {
    const pins = new Set<number>([0, 1]);

    for (const chapter of this.#slider?.querySelectorAll<HTMLElement>('.media-time-slider-chapter') ?? []) {
      const start = percent(chapter.style.getPropertyValue('--media-slider-chapter-start'));

      if (start > 0.004 && start < 0.996) pins.add(start);
    }

    const next = [...pins].sort((a, b) => a - b);

    if (next.join() === this.#pinsAt.join()) return;

    this.#pinsAt = next;
    this.#drawFrets();
    this.#signature = '';
  }

  /** A point on the string: `along` from 0 to 1, `across` in pixels from the rest line. */
  #xy(along: number, across: number): [number, number] {
    const middle = this.#thickness / 2;

    return this.#volume ? [middle + across, (1 - along) * this.#length] : [along * this.#length, middle + across];
  }

  #drawFrets(): void {
    const half = Math.min(this.#thickness / 2 - 1, 8);

    this.#frets.replaceChildren(
      ...this.#pinsAt.map((pin, index) => {
        const end = index === 0 || index === this.#pinsAt.length - 1;
        const fret = make('line', end ? 'pluck-string-fret pluck-string-end' : 'pluck-string-fret');
        const reach = end ? half * 0.75 : half;
        const [x1, y1] = this.#xy(pin, -reach);
        const [x2, y2] = this.#xy(pin, reach);

        fret.setAttribute('x1', x1.toFixed(1));
        fret.setAttribute('y1', y1.toFixed(1));
        fret.setAttribute('x2', x2.toFixed(1));
        fret.setAttribute('y2', y2.toFixed(1));

        return fret;
      })
    );
  }

  /** The fretted span that holds a position. */
  #span(at: number): [number, number] {
    for (let index = 1; index < this.#pinsAt.length; index++) {
      if (at <= this.#pinsAt[index]!) return [this.#pinsAt[index - 1]!, this.#pinsAt[index]!];
    }

    return [0, 1];
  }

  /** The note a pluck at `at` sounds: set by the fretted length on the timeline, by tension on the volume string. */
  #noteAt(at: number, fill: number): Note {
    if (this.#volume) return noteFor(OPEN_STRING * 2 * 2 ** (fill * 2));

    const [from, to] = this.#span(at);

    return noteFor(Math.min(OPEN_STRING / Math.max(to - from, 0.05), OPEN_STRING * 16));
  }

  /** How fast a span rings on screen. Shorter or tighter rings faster. */
  #speed(from: number, to: number, fill: number): number {
    if (this.#volume) return FREQUENCY * (0.7 + fill * 1.4);

    return FREQUENCY * Math.min(Math.sqrt(1 / Math.max(to - from, 0.05)), 3);
  }

  #pluck(at: number, height: number, fill: number, strength: number): void {
    pluckSound(this.#noteAt(at, fill).frequency, strength, this.#voice(), this.#volume ? 0 : at * 2 - 1);

    if (this.#calm.matches || Math.abs(height) < 0.4) return;

    const [from, to] = this.#volume ? [0, 1] : this.#span(at);

    this.#rings.push({ start: performance.now(), from, to, at, height, speed: this.#speed(from, to, fill) });
    if (this.#rings.length > 4) this.#rings.shift();
  }

  /** Displacement of the string at `x` (0 to 1) from everything acting on it. */
  #displacement(x: number, now: number, pullFrom: number, pullTo: number): number {
    let y = 0;

    // The pointer holds a triangle whose peak is under it.
    if (this.#pull && x > pullFrom && x < pullTo) {
      y +=
        x <= this.#pullAt
          ? (this.#pull * (x - pullFrom)) / Math.max(this.#pullAt - pullFrom, 1e-4)
          : (this.#pull * (pullTo - x)) / Math.max(pullTo - this.#pullAt, 1e-4);
    }

    // Spans still ringing from an earlier release.
    for (const ring of this.#rings) {
      if (x <= ring.from || x >= ring.to) continue;

      const length = ring.to - ring.from;
      const u = (x - ring.from) / length;
      const p = Math.min(Math.max((ring.at - ring.from) / length, 0.06), 0.94);
      const t = (now - ring.start) / 1000;
      const scale = (2 * ring.height) / (Math.PI * Math.PI * p * (1 - p));

      for (let n = 1; n <= HARMONICS; n++) {
        y +=
          (scale / (n * n)) *
          Math.sin(n * Math.PI * p) *
          Math.sin(n * Math.PI * u) *
          Math.cos(2 * Math.PI * ring.speed * n * t) *
          Math.exp(-DECAY * n * t);
      }
    }

    // The string never leaves its own box.
    const limit = this.#volume ? this.#thickness / 2 - 2 : DRAG_PULL + 6;

    return Math.min(Math.max(y, -limit), limit);
  }

  #tick = (): void => {
    this.#frame = requestAnimationFrame(this.#tick);

    const slider = this.#slider;
    const now = performance.now();
    const gap = now - this.#lastTick;

    this.#lastTick = now;

    if (!slider || document.hidden || !this.#length) return;

    const style = getComputedStyle(slider);
    const dragging = slider.hasAttribute('data-dragging');
    const pointing = dragging || slider.hasAttribute('data-pointing');
    const pointer = percent(style.getPropertyValue('--media-slider-pointer'));
    const fill = dragging ? pointer : percent(style.getPropertyValue('--media-slider-fill'));
    const buffer = this.#volume ? fill : Math.max(percent(style.getPropertyValue('--media-slider-buffer')), fill);
    const calm = this.#calm.matches;

    // Name the note under the pointer, for the preview.
    if (this.#note && pointing) {
      const name = this.#noteAt(pointer, fill).name;

      if (name !== this.#noteName) {
        this.#noteName = name;
        this.#note.textContent = name;
      }
    }

    // Ease the pull toward where the pointer wants it; let go when the pointer leaves.
    if (pointing) {
      const limit = calm ? 0 : dragging ? DRAG_PULL : HOVER_PULL;
      const target = Math.min(Math.max(this.#offset, -limit), limit);

      this.#pull += (target - this.#pull) * 0.35;
      this.#pullAt = this.#volume ? fill : pointer;
      this.#held = true;
      this.#dragged ||= dragging;
    } else if (this.#held) {
      const strength = this.#dragged ? Math.max(Math.abs(this.#pull) / DRAG_PULL, 0.45) : Math.abs(this.#pull) / DRAG_PULL;

      // A hover that barely bent the string lets go in silence.
      if (this.#dragged || Math.abs(this.#pull) > 3) this.#pluck(this.#pullAt, this.#pull, fill, strength);
      this.#pull = 0;
      this.#held = false;
      this.#dragged = false;
    }

    // A jump with no pointer on the slider is a seek from the keyboard, a gesture or a button. Skip the first
    // reading, and any after the page was away, so loading or coming back to the tab is silent.
    if (!pointing && !Number.isNaN(this.#fill) && gap < 250 && Math.abs(fill - this.#fill) > (this.#volume ? 0.004 : 0.012)) {
      this.#pluck(fill, -KEY_PLUCK, fill, 0.35);
    }

    this.#fill = fill;
    this.#rings = this.#rings.filter((ring) => now - ring.start < 1600);

    const moving = this.#rings.length > 0 || Math.abs(this.#pull) > 0.05;
    const signature = `${fill.toFixed(4)}|${buffer.toFixed(3)}|${this.#length}|${this.#thickness}`;

    if (!moving && this.#still && signature === this.#signature) return;

    this.#still = !moving;
    this.#signature = signature;
    this.#draw(fill, buffer, now);
  };

  #draw(fill: number, buffer: number, now: number): void {
    const [pullFrom, pullTo] = this.#volume ? [0, 1] : this.#span(this.#pullAt);
    const xs: number[] = [];

    for (let x = 0; x < this.#length; x += STEP) xs.push(x / this.#length);
    xs.push(fill, buffer, 1, ...this.#pinsAt);
    xs.sort((a, b) => a - b);

    const point = (x: number): string =>
      this.#xy(x, this.#displacement(x, now, pullFrom, pullTo))
        .map((value) => value.toFixed(2))
        .join(' ');
    const line = (from: number, to: number): string => {
      const points = xs.filter((x) => x >= from && x <= to).map(point);

      return points.length > 1 ? `M${points.join('L')}` : '';
    };
    const played = line(0, fill);

    this.#rest.setAttribute('d', line(buffer, 1));
    this.#buffer.setAttribute('d', line(fill, buffer));
    this.#played.setAttribute('d', played);
    this.#winding.setAttribute('d', played);

    // The slide sits on the string at the playhead, square to it.
    const [x, y] = this.#xy(fill, this.#displacement(fill, now, pullFrom, pullTo));
    const long = 15;
    const short = 7;
    const [width, height] = this.#volume ? [long, short] : [short, long];

    this.#slide.setAttribute('x', (x - width / 2).toFixed(2));
    this.#slide.setAttribute('y', (y - height / 2).toFixed(2));
    this.#slide.setAttribute('width', String(width));
    this.#slide.setAttribute('height', String(height));
    this.#slide.setAttribute('rx', String(short / 2));
  }
}

if (!customElements.get('pluck-string')) customElements.define('pluck-string', PluckStringElement);

export { PluckStringElement };
