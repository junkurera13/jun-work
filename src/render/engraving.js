// Builds the "JUN PARK" brand that is burnt / engraved into the stick.
// Letters are stacked vertically so the name reveals itself letter by letter,
// top to bottom, as the ice cream melts off the stick.

export function engravingCanvas() {
  // maps onto the stick's 1.9 cm width and the 3.6 cm text band
  const W = 384;
  const H = 1248;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);

  const letters = ["J", "U", "N", "", "P", "A", "R", "K"];
  const slot = H / letters.length;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '700 128px "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
  g.filter = "blur(2.2px)";
  letters.forEach((ch, i) => {
    if (!ch) return;
    // slight hand-stamped irregularity
    const jx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    g.save();
    g.translate(W / 2 + jx * 2, slot * (i + 0.5) + (i > 3 ? -slot * 0.5 : 0) + 4);
    g.rotate(jx * 0.015);
    g.scale(0.58, 1); // keep letters in proportion on the stick
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.filter = "none";
  return c;
}
