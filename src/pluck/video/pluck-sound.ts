/**
 * `<pluck-sound>` wraps the string-sound button: a real `<button>` with `aria-pressed`, so it is a toggle to the
 * keyboard and to screen readers. It keeps every such button on the page in step with the remembered setting.
 */

import { onSoundChange, setSoundEnabled, soundEnabled } from './pluck-audio';

class PluckSoundElement extends HTMLElement {
  #stop: (() => void) | null = null;

  connectedCallback(): void {
    const button = this.querySelector('button');

    if (!button) return;

    const sync = (on: boolean): void => {
      button.setAttribute('aria-pressed', String(on));
      button.toggleAttribute('data-active', on);
    };

    sync(soundEnabled());
    this.#stop = onSoundChange(sync);
    button.addEventListener('click', this.#toggle);
  }

  disconnectedCallback(): void {
    this.#stop?.();
    this.querySelector('button')?.removeEventListener('click', this.#toggle);
  }

  #toggle = (): void => setSoundEnabled(!soundEnabled());
}

if (!customElements.get('pluck-sound')) customElements.define('pluck-sound', PluckSoundElement);

export { PluckSoundElement };
