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
    // a clean patch of plain surface, clear of the big studio reflection,
    // which reads as a stripe or a pale square once it's cut out
    swatch: { x: -0.2, y: -3.2, half: 1.6 },
    label: "A Magic Choc vanilla ice cream. Tap it to crack the chocolate shell; it melts slowly.",
  },
  {
    id: "faluda",
    name: "faluda",
    faluda: true,
    shell: "ice",
    swatch: { x: 0, y: -1, half: 1.5 },
    label: "A pink Faluda popsicle with a vanilla ice cream center. Tap to crack the icy shell.",
  },
  {
    id: "passion-coconut",
    name: "passionfruit coconut",
    // a boxier lolly mould with two grooves down each face: creamy coconut
    // ice, topped with a layer of passionfruit pulp (seeds and all) that has
    // run down the faces before it froze
    faluda: true,
    coco: true,
    shell: "ice",
    swatch: { x: 0.2, y: 3.4, half: 1.5 },
    label: "A coconut ice lolly topped with passionfruit pulp and seeds. Tap to crack the ice.",
  },
];
