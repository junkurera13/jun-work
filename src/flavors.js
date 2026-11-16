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
    mould: 1,
    shell: "ice",
    swatch: { x: 0.2, y: 3.4, half: 1.5 },
    label: "A coconut ice lolly topped with passionfruit pulp and seeds. Tap to crack the ice.",
  },
  {
    id: "strawberry-milk",
    name: "strawberry milk",
    // a tapered wedge mould: pink strawberry milk frozen soft, freckled with
    // crushed strawberry. Nothing to crack: pressing it leaves a soft dent
    faluda: true,
    mould: 2,
    soft: true,
    shell: "soft",
    swatch: { x: 0.1, y: -1.6, half: 1.5 },
    label: "A strawberry milk ice pop, freckled with crushed strawberries. Press it to leave a soft dent.",
  },
  {
    id: "white-blueberry",
    name: "white choc blueberry",
    // the Magic Choc bar, dipped in white chocolate, with blueberry yoghurt
    // ice cream inside: creamy white rippled with purple and berry pieces
    faluda: false,
    white: true,
    shell: "choc",
    // the picker looks under the white chocolate, at the blueberry ripple
    swatch: { x: 0.9, y: -1.4, half: 1.4, peel: true },
    label: "A white chocolate bar with blueberry yoghurt ice cream inside. Tap it to crack the shell.",
  },
];
