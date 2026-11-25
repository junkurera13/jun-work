// Entry for the home page.
import { setupChoices } from "./choices.js";
import { mountMagicChoc } from "./magic-choc.js";
import { setupIcecreamView } from "./icecream-view.js";
import { setupSoundButton } from "./sound-button.js";
import { setupWork } from "./work.js";

setupChoices();

const magicChoc = document.querySelector(".live-choc");
if (magicChoc) mountMagicChoc(magicChoc);

// Clicking the ice cream opens it on the right, on a white page
const stage = document.querySelector(".stage");
if (stage) setupIcecreamView(stage);

const soundButton = document.querySelector(".sound");
if (soundButton) setupSoundButton(soundButton);

setupWork();
