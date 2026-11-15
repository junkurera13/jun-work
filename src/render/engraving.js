// Builds the "JUN PARK" brand that is burnt / engraved into the stick.
// Letters are stacked vertically so the name reveals itself letter by letter,
// top to bottom, as the ice cream melts off the stick.

export function engravingCanvas() {
  const W = 192;
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
  g.font = '700 112px "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
  g.filter = "blur(2.2px)";
  letters.forEach((ch, i) => {
    if (!ch) return;
    // slight hand-stamped irregularity
    const jx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    g.save();
    g.translate(W / 2 + jx * 2, slot * (i + 0.5) + (i > 3 ? -slot * 0.5 : 0) + 4);
    g.rotate(jx * 0.015);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.filter = "none";
  return c;
}
