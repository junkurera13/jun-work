// The site-wide sound on/off button (in the CONTACT row on the home page). It flips
// the shared switch in src/sound-setting.js, which the menu blips and the
// ice cream page (open in its frame or on its own) also follow.
import { onSoundChange, setSoundOn, soundOn } from "../sound-setting.js";
import { playSoundOn } from "./choices.js";

export function setupSoundButton(button) {
  const show = (on) => {
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Mute sounds" : "Turn sounds on";
  };
  show(soundOn());
  button.addEventListener("click", () => {
    const on = !soundOn();
    setSoundOn(on);
    if (on) playSoundOn();
  });
  onSoundChange(show);
}
