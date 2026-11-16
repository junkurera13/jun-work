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
    label: "A Magic Choc vanilla ice cream. Tap it to crack the chocolate shell; it melts slowly.",
  },
  {
    id: "faluda",
    name: "faluda",
    faluda: true,
    shell: "ice",
    label: "A pink Faluda popsicle with a vanilla ice cream center. Tap to crack the icy shell.",
  },
];
