// Every ice cream on the page. The dock at the bottom is built from this
// list; each one gets a little live-rendered icon of itself.
//
// Adding a flavor: add an entry here, then teach the shape (sim/shape.js +
// shaders/common.glsl), the materials (shaders/scene.frag.glsl) and the crack
// sound (audio/crack.js) what it is made of.

export const FLAVORS = [
  {
    id: "magic-choc",
    name: "magic choc",
    faluda: false,
    shell: "choc",
    // where the picker's round window looks onto the bar (cm, front face):
    // low on the face, mostly deep chocolate with just a soft glint, since a
    // patch of the big reflection reads as a grey stripe once it's cut out
    swatch: { x: 0.3, y: -2.4, half: 1.9 },
    label: "A Magic Choc vanilla ice cream. Tap it to crack the chocolate shell; it melts slowly.",
  },
  {
    id: "faluda",
    name: "faluda",
    faluda: true,
    shell: "ice",
    swatch: { x: 0.75, y: 0.9, half: 1.9 },
    label: "A pink Faluda popsicle with a vanilla ice cream center. Tap to crack the icy shell.",
  },
];
