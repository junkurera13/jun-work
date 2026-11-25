// One sound on/off switch for the whole site: the home pages' blips and the
// ice cream page's cracks and weather all follow it. It's kept in
// localStorage, so it survives reloads and reaches the ice cream when that's
// open in a frame on the home page (other documents of the site get a "storage"
// event when it changes; this one gets "soundchange").
const KEY = "sound";

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage blocked: the switch still works for this page
  }
  dispatchEvent(new CustomEvent("soundchange", { detail: on }));
}

// Calls fn(on) whenever the switch changes, here or in another page or frame
// of the site.
export function onSoundChange(fn) {
  addEventListener("soundchange", (e) => fn(e.detail));
  addEventListener("storage", (e) => {
    if (e.key === KEY) fn(soundOn());
  });
}
