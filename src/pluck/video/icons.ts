// Pluck's icons are drawn the way its timeline is: lengths of string with round ends and soft corners.
// They take the control's colour. Stroke width comes from CSS.

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" viewBox="0 0 24 24">${body}</svg>`;

const speaker =
  '<path d="M4.8 9.4H6.4Q7 9.4 7.5 9L9.3 7.3Q10.6 6.2 10.6 7.9V16.1Q10.6 17.8 9.3 16.7L7.5 15Q7 14.6 6.4 14.6H4.8Q3.5 14.6 3.5 13.3V10.7Q3.5 9.4 4.8 9.4Z"/>';
const innerWave = `<path d="M14 8.5Q16.2 12 14 15.5"/>`;
const outerWave = `<path d="M17.5 5.5Q21.3 12 17.5 18.5"/>`;
const screen = '<path d="M5 15.5H4.6Q3 15.5 3 13.9V6.6Q3 5 4.6 5H19.4Q21 5 21 6.6V13.9Q21 15.5 19.4 15.5H19"/>';
const castScreen = '<path d="M3 8V6.6Q3 5 4.6 5H19.4Q21 5 21 6.6V16.4Q21 18 19.4 18H13"/>';
const castWaves = `<path d="M3 11.5A6.5 6.5 0 0 1 9.5 18M3 15A3 3 0 0 1 6 18"/>`;
const captionFrame = '<rect x="3" y="5.5" width="18" height="13" rx="4"/>';

export const pluckIcons: Record<string, string> = {
  play: svg(`<path d="M7 8.6V16.4Q7 19.6 9.8 18L17.6 13.6Q20.2 12 17.6 10.4L9.8 6Q7 4.4 7 7.6Z"/>`),
  pause: svg(`<path d="M8.5 5.5V18.5M15.5 5.5V18.5"/>`),
  restart: svg(`<path d="M5.2 9.6A7.4 7.4 0 1 1 4.6 13.6"/><path d="M4.6 5.2V8.4Q4.6 9.8 6 9.8H9.2"/>`),
  'volume-high': svg(`${speaker}${innerWave}${outerWave}`),
  'volume-low': svg(`${speaker}${innerWave}`),
  // Muted: the strings have gone slack.
  'volume-off': svg(
    `${speaker}<path d="M14.5 8.5Q15 15 16.8 17.2M18 5.5Q18.6 14 20.6 17" opacity="0.5"/>`
  ),
  'captions-off': svg(`${captionFrame}<path d="M7 11.4H11M13.2 11.4H17M7 14.6H14"/>`),
  'captions-on': svg(`${captionFrame}<path d="M7 9.6H17M7 12.4H11M13.2 12.4H17M7 15.2H14"/>`),
  gear: svg('<path d="M9.96 5.41 L10.48 3.13 L13.52 3.13 L14.04 5.41 L15.22 5.90 L17.20 4.65 L19.35 6.80 L18.10 8.78 L18.59 9.96 L20.87 10.48 L20.87 13.52 L18.59 14.04 L18.10 15.22 L19.35 17.20 L17.20 19.35 L15.22 18.10 L14.04 18.59 L13.52 20.87 L10.48 20.87 L9.96 18.59 L8.78 18.10 L6.80 19.35 L4.65 17.20 L5.90 15.22 L5.41 14.04 L3.13 13.52 L3.13 10.48 L5.41 9.96 L5.90 8.78 L4.65 6.80 L6.80 4.65 L8.78 5.90Z"/><circle cx="12" cy="12" r="2.9"/>'),
  switches: svg(
    `<path d="M4 7H13.4M17.6 7H20M4 17H6.4M10.6 17H20"/><circle cx="15.5" cy="7" r="2.1"/><circle cx="8.5" cy="17" r="2.1"/>`
  ),
  'fullscreen-enter': svg(
    `<path d="M4 9.2V6.6Q4 4 6.6 4H9.2M14.8 4H17.4Q20 4 20 6.6V9.2M20 14.8V17.4Q20 20 17.4 20H14.8M9.2 20H6.6Q4 20 4 17.4V14.8"/>`
  ),
  'fullscreen-exit': svg(
    `<path d="M4 9H6.6Q9 9 9 6.6V4M15 4V6.6Q15 9 17.4 9H20M20 15H17.4Q15 15 15 17.4V20M9 20V17.4Q9 15 6.6 15H4"/>`
  ),
  'pip-enter': svg(
    `<path d="M20 10.5V7.8Q20 5 17.2 5H5.8Q3 5 3 7.8V15.2Q3 18 5.8 18H9.5"/><rect x="12.5" y="13" width="8.5" height="6" rx="2"/>`
  ),
  'pip-exit': svg(
    `<path d="M4 13.5V16.2Q4 19 6.8 19H18.2Q21 19 21 16.2V8.8Q21 6 18.2 6H14.5"/><rect x="3" y="4" width="8.5" height="6" rx="2"/>`
  ),
  'airplay-enter': svg(`${screen}<path d="M9.4 19.4L11.2 17.1Q12 16.1 12.8 17.1L14.6 19.4Q15.2 20.2 14.2 20.2H9.8Q8.8 20.2 9.4 19.4Z"/>`),
  'airplay-exit': svg(
    `${screen}<path fill="currentColor" d="M9.4 19.4L11.2 17.1Q12 16.1 12.8 17.1L14.6 19.4Q15.2 20.2 14.2 20.2H9.8Q8.8 20.2 9.4 19.4Z"/>`
  ),
  'cast-enter': svg(`${castScreen}${castWaves}`),
  'cast-exit': svg(`${castScreen}${castWaves}<path d="M7 8.5H17V14.5H13.5"/>`),
  speech: svg('<path d="M5.6 4.5H18.4Q20.5 4.5 20.5 6.6V13.4Q20.5 15.5 18.4 15.5H11.6L7.4 19Q6.5 19.7 6.5 18.6V15.5H5.6Q3.5 15.5 3.5 13.4V6.6Q3.5 4.5 5.6 4.5Z"/>'),
  speed: svg(`<path d="M4.4 17A8.2 8.2 0 1 1 19.6 17"/><path d="M12 14L15.6 9"/><circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none"/>`),
  check: svg('<path d="M5 12.6L9.4 17L19 7.4"/>'),
  chevron: svg('<path d="M9.5 5.5L15.5 12L9.5 18.5"/>'),
  // String sound: a note, ringing or struck through.
  'sound-on': svg(
    `<ellipse cx="8.6" cy="17" rx="3.1" ry="2.4" transform="rotate(-20 8.6 17)" fill="currentColor"/><path d="M11.5 16V4.5Q14.5 5.2 15.5 8.2"/><path d="M17.6 11.6Q19.2 13.6 17.6 15.6M19.9 9.6Q22.6 13.6 19.9 17.6" opacity="0.75"/>`
  ),
  'sound-off': svg(
    `<ellipse cx="8.6" cy="17" rx="3.1" ry="2.4" transform="rotate(-20 8.6 17)"/><path d="M11.5 16V4.5Q14.5 5.2 15.5 8.2"/><path d="M4 4L20 20"/>`
  ),
  // Loading: a soundhole's rosette, turning.
  spinner: svg(
    `<style>@keyframes media-pluck-spin{to{transform:rotate(360deg)}}</style><circle cx="12" cy="12" r="4.2" opacity="0.5"/><g style="transform-box:view-box;transform-origin:center;animation:var(--media-spinner-animation, media-pluck-spin 1.6s linear infinite)"><circle cx="12" cy="12" r="8.4" stroke-dasharray="1.2 2.6"/><path d="M12 3.6A8.4 8.4 0 0 1 20.4 12" stroke-width="2.6"/></g>`
  ),
};
