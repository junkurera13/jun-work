// Slide 4: a box of Ceylon green tea with one teabag lying on top, and a
// glass cup of just-boiled water on a porcelain saucer. Click and the bag is
// lifted by its tag, lowered into the cup and left to steep, its string over
// the rim; the water slowly turns golden. Click again to dunk it.
//
// three.js is loaded only when this slide is shown.

import { playPlop } from "../home/choices.js";
import { boxFront, boxSide, boxTop, bagPaper, tagArt, puff } from "./textures.js";

// sizes in cm
const BOX = { w: 12, h: 6.8, d: 5.6, x: -6.4, z: -1.2, yaw: 0.32 };
const CUP = { x: 7.6, z: 0.6, base: 0.3, floor: 0.9 };
const WATER_Y = CUP.base + 5.7; // the water's surface, world height
const BAG = { w: 3.9, l: 5.1, puff: 0.34 }; // in the photo proportions
const TAG = { w: 1.8, h: 2.07, notch: 0.16 };
const STRING = 6; // from knot to tag
const DRAPE_A = Math.PI - 0.3; // the tag hangs over the left of the rim, a little toward us
const TEA = [0.8, 0.52, 0.06]; // what the water steeps toward

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export function mountTea(host) {
  let destroyed = false;
  let cleanup = () => {};
  init(host, () => destroyed).then((c) => {
    if (destroyed) c?.();
    else if (c) cleanup = c;
  });
  return {
    destroy() {
      destroyed = true;
      cleanup();
    },
  };
}

async function init(host, gone) {
  const [THREE, { RoomEnvironment }, { RoundedBoxGeometry }] = await Promise.all([
    import("three"),
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
    document.fonts?.ready,
  ]);
  if (gone()) return null;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---- renderer, scene, camera ----
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "tea-canvas";
  canvas.style.cssText = "display:block;width:100%;height:100%;cursor:pointer;opacity:0;transition:opacity 500ms ease;outline:none";
  canvas.setAttribute("role", "button");
  canvas.setAttribute("aria-label", "Put the teabag in the cup");
  canvas.tabIndex = 0;
  host.append(canvas);

  const scene = new THREE.Scene();
  const page = getComputedStyle(document.documentElement).getPropertyValue("--page").trim() || "#efff47";
  scene.background = new THREE.Color(page);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.9;
  room.dispose?.();

  const camera = new THREE.PerspectiveCamera(26, 1, 1, 400);
  const target = V(1.2, 4.2, 0);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-12, 26, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e060, 0.5));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.2, color: 0x2a2400 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const disposables = [];
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    disposables.push(t);
    return t;
  };

  // a soft contact shadow, for glass, which casts no real one
  const contact = (radius, opacity) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(40, 36, 0, 1)");
    g.addColorStop(0.55, "rgba(40, 36, 0, 0.45)");
    g.addColorStop(1, "rgba(40, 36, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // ---- the box ----
  const box = new THREE.Mesh(new RoundedBoxGeometry(BOX.w, BOX.h, BOX.d, 4, 0.12), []);
  const card = (c) => new THREE.MeshPhysicalMaterial({ map: tex(c), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const endW = Math.round((500 * BOX.d) / BOX.w);
  const side = card(boxSide(endW));
  const lid = card(boxTop(endW));
  box.material = [side, side, lid, lid, card(boxFront()), card(boxFront())];
  box.position.set(BOX.x, BOX.h / 2, BOX.z);
  box.rotation.y = BOX.yaw;
  box.castShadow = box.receiveShadow = true;
  scene.add(box);
  const boxRight = V(Math.cos(BOX.yaw), 0, -Math.sin(BOX.yaw));
  const boxFwd = V(Math.sin(BOX.yaw), 0, Math.cos(BOX.yaw));
  const boxTopC = V(BOX.x, BOX.h, BOX.z);

  // ---- glass ----
  // Thin glass on a bright page reads by its reflections and its darker
  // edges, so it is drawn as reflection added over a faint, edge-heavy veil.
  const glass = () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor;
    m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
        float fr = pow(1.0 - abs(dot(normalize(normal), geometryViewDir)), 3.0);
        float glint = smoothstep(0.25, 0.9, dot(outgoingLight, vec3(0.3, 0.5, 0.2)));
        gl_FragColor = vec4(outgoingLight * (0.35 + 1.2 * glint) + vec3(0.03, 0.06, 0.04) * fr, clamp(0.015 + fr * 0.55 + glint * 0.35, 0.0, 0.9));`
      );
    };
    return m;
  };
  const lathe = (pts, segs = 96) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

  const saucer = new THREE.Mesh(
    lathe([[0, 0.02], [2.8, 0.02], [3.0, 0.16], [3.1, 0.2], [6.2, 0.62], [6.45, 0.78], [6.5, 0.86], [6.35, 0.86], [6.1, 0.72], [3.1, 0.34], [0, 0.32]]),
    // white glazed porcelain
    new THREE.MeshPhysicalMaterial({ color: 0xf6f4ee, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06, ior: 1.5 })
  );
  saucer.position.set(CUP.x, 0, CUP.z);
  saucer.castShadow = saucer.receiveShadow = true;
  // a fine gold line around the rim
  const gilt = new THREE.Mesh(new THREE.TorusGeometry(6.43, 0.035, 8, 160), new THREE.MeshStandardMaterial({ color: 0xd9b25a, metalness: 1, roughness: 0.25 }));
  gilt.rotation.x = Math.PI / 2;
  gilt.position.set(CUP.x, 0.85, CUP.z);
  // the glass cup casts no real shadow, so a faint one where it sits
  const cupShadow = contact(4.1, 0.16);
  cupShadow.position.set(CUP.x, 0.34, CUP.z);
  scene.add(saucer, gilt, cupShadow);

  const cupPts = [[0, 0.05], [3.5, 0.05], [3.72, 0.18], [3.8, 0.5], [4.2, 6.92], [4.2, 7], [4.15, 7.04], [4.04, 7.02], [3.98, 6.9], [3.63, 1.0], [3.4, CUP.floor], [0, CUP.floor - 0.04]];
  const cup = new THREE.Group();
  cup.position.set(CUP.x, CUP.base, CUP.z);
  const cupGlass = glass();
  cup.add(new THREE.Mesh(lathe(cupPts), cupGlass));
  // the handle
  const hdir = V(Math.cos(0.22), 0, Math.sin(0.22)); // on the right, turned a little toward us
  const hp = (r, y) => hdir.clone().multiplyScalar(r).setY(y);
  cup.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([hp(3.9, 5.9), hp(5.3, 5.8), hp(6.1, 4.8), hp(5.8, 3.0), hp(4.8, 2.1), hp(3.85, 1.9)]), 64, 0.3, 16),
      cupGlass
    )
  );
  scene.add(cup);
  const cupC = V(CUP.x, CUP.base, CUP.z);

  // the water: the one truly refracting thing, so the bag bends inside it
  const innerR = (y) => 3.4 + ((3.98 - 3.4) * (y - CUP.floor)) / (6.9 - CUP.floor);
  const waterTop = WATER_Y - CUP.base;
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.02,
    transmission: 1,
    ior: 1.33,
    thickness: 1.6,
    attenuationColor: new THREE.Color(1, 1, 1),
    attenuationDistance: 40,
    depthWrite: false,
  });
  const water = new THREE.Mesh(
    lathe([[0, CUP.floor + 0.01], [3.38, CUP.floor + 0.02], [innerR(waterTop) - 0.03, waterTop - 0.05], [innerR(waterTop) - 0.1, waterTop], [0, waterTop]]),
    waterMat
  );
  water.position.copy(cupC);
  scene.add(water);

  // ---- the teabag ----
  // Flat filter paper with its top corners folded in (the outline is in the
  // texture's alpha), puffed out only where the leaves have settled.
  const DRY = new THREE.Color(1, 1, 1);
  const WET = new THREE.Color(0.8, 0.68, 0.48);
  const paper = new THREE.MeshPhysicalMaterial({
    map: tex(bagPaper()),
    alphaTest: 0.5,
    roughness: 0.95,
    sheen: 0.3,
    sheenColor: new THREE.Color(1, 0.98, 0.92),
    sheenRoughness: 0.6,
  });

  // one sheet, its top edge at the origin; the back is its mirror
  const sheet = new THREE.PlaneGeometry(BAG.w, BAG.l, 30, 40);
  sheet.translate(0, -BAG.l / 2, 0);
  {
    const p = sheet.attributes.position;
    const smooth = (a, b, x) => ease((x - a) / (b - a));
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + BAG.w / 2) / BAG.w;
      const v = -p.getY(i) / BAG.l;
      const uu = clamp01((u - 0.02) / 0.96);
      const vv = clamp01((v - 0.04) / 0.94);
      const leaves = 0.18 + 0.82 * smooth(0.5, 0.74, v);
      let z = BAG.puff * Math.pow(Math.sin(Math.PI * uu), 0.45) * Math.pow(Math.sin(Math.PI * vv), 0.35) * leaves;
      if (z > 0) z += 0.015 * Math.sin(u * 29 + v * 9) * Math.sin(v * 21) * leaves;
      p.setZ(i, z);
    }
    sheet.computeVertexNormals();
  }
  const bag = new THREE.Group();
  const front = new THREE.Mesh(sheet, paper);
  const back = new THREE.Mesh(sheet, paper);
  back.scale.z = -1;
  front.castShadow = back.castShadow = true;
  // the string is knotted through the top of the fold
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.9 }));
  knot.position.set(0, -0.1, 0);
  bag.add(front, back, knot);
  scene.add(bag);

  // ---- the tag, hanging from its origin (the bottom of its top notch) ----
  const tagMat = new THREE.MeshStandardMaterial({ map: tex(tagArt()), alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide });
  const tagGeo = new THREE.PlaneGeometry(TAG.w, TAG.h);
  tagGeo.translate(0, -TAG.h / 2 + TAG.notch, 0);
  const tagMesh = new THREE.Mesh(tagGeo, tagMat);
  tagMesh.castShadow = true;
  const tag = new THREE.Group();
  tag.add(tagMesh);
  scene.add(tag);

  // ---- the string ----
  const string = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xf7f5ee, roughness: 0.9 }));
  string.castShadow = true;
  scene.add(string);
  const setString = (pts) => {
    string.geometry.dispose();
    string.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.028, 5);
  };

  // ---- poses ----
  const basis = (y, zHint) => {
    y = y.clone().normalize();
    const z = zHint.clone().sub(y.clone().multiplyScalar(zHint.dot(y))).normalize();
    const x = y.clone().cross(z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  const UP = V(0, 1, 0);
  const TOWARD = V(0.15, 0, 1);

  // at rest: the bag flat on the box, its top toward the back left; the tag
  // flat beside it
  const bagDir = V(0, 0, -1).applyAxisAngle(UP, BOX.yaw + 0.55);
  const bagCenter = boxTopC.clone().addScaledVector(boxRight, -1.5).addScaledVector(boxFwd, 0.2);
  const REST_TOP = bagCenter.clone().addScaledVector(bagDir, BAG.l / 2).setY(BOX.h + 0.1);
  const REST_Q = basis(bagDir, UP);
  const tagCenter = boxTopC.clone().addScaledVector(boxRight, 3.3).addScaledVector(boxFwd, 0.5);
  const tagDir = REST_TOP.clone().sub(tagCenter).setY(0).normalize().applyAxisAngle(UP, -0.5);
  const TAG_REST = tagCenter.clone().addScaledVector(tagDir, TAG.h / 2 - TAG.notch).setY(BOX.h + 0.03);
  const TAG_REST_Q = basis(tagDir, UP);
  const TAG_HELD_Q = basis(V(0, -1, 0), TOWARD);
  const out = V(Math.cos(DRAPE_A), 0, Math.sin(DRAPE_A));
  const rimAt = (r, y) => cupC.clone().addScaledVector(out, r).setY(CUP.base + y);
  const TAG_DRAPED = rimAt(4.55, 5.4);
  const TAG_DRAPED_Q = basis(V(0, 1, 0).addScaledVector(out, -0.05), out);
  const HOLD = V(CUP.x, 21, CUP.z);
  const LOWERED = WATER_Y + 0.8; // the bag's top once it is in
  const LEAN_TOP = rimAt(2.5, LOWERED - CUP.base - 0.2);
  const LEAN_Q = basis(V(0, 1, 0).addScaledVector(out, 0.28), TOWARD.clone().applyAxisAngle(UP, -0.3));
  const RIM = () => [rimAt(3.8, 7.12), rimAt(4.22, 7.14), rimAt(4.5, 6.6)];

  const restString = () => {
    const pts = [];
    const a = REST_TOP.clone().setY(BOX.h + 0.04);
    const b = TAG_REST;
    const across = b.clone().sub(a).cross(UP).normalize();
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      pts.push(a.clone().lerp(b, k).addScaledVector(across, Math.sin(k * Math.PI) * 0.9).setY(BOX.h + 0.04));
    }
    return pts;
  };

  // ---- steam, dye, ripples ----
  const puffTex = tex(puff());
  const steam = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    s.userData = { life: Math.random(), speed: 0.16 + Math.random() * 0.1, a: Math.random() * 6.28, r: Math.random() * 2.6, wob: Math.random() * 6.28 };
    steam.push(s);
    scene.add(s);
  }
  const dye = [];
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: new THREE.Color(...TEA), transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    s.userData = { life: 1, pos: V(), vel: V(), span: 4 };
    dye.push(s);
    scene.add(s);
  }
  const ripples = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(CUP.x, WATER_Y + 0.02, CUP.z);
    m.userData.t = null;
    scene.add(m);
    return m;
  });

  // ---- state ----
  let phase = "rest"; // rest, moving, steeping
  let t = 0; // time into the move
  let plopped = false;
  let steep = 0;
  let wet = 0;
  let swirl = 0;
  let dunk = -1;
  let hover = 0;
  let hoverTarget = 0;
  const pointer = { x: 0, y: 0, ex: 0, ey: 0 };
  const bagTop = REST_TOP.clone();
  const bagQ = REST_Q.clone();
  const tagPos = TAG_REST.clone();
  const tagQ = TAG_REST_Q.clone();

  function spawnDye() {
    const s = dye.find((d) => d.userData.life >= 1);
    if (!s) return;
    const p = V((Math.random() - 0.5) * BAG.w * 0.8, -BAG.l * (0.6 + Math.random() * 0.35), 0).applyQuaternion(bagQ).add(bagTop);
    if (p.y > WATER_Y - 0.3) return;
    const u = s.userData;
    u.pos.copy(p);
    u.vel.set((Math.random() - 0.5) * 0.3, -0.12 - Math.random() * 0.2, (Math.random() - 0.5) * 0.3);
    u.life = 0;
    u.span = 3 + Math.random() * 3;
    s.visible = true;
  }

  const act = () => {
    if (phase === "rest") {
      phase = "moving";
      t = 0;
      hoverTarget = 0;
      canvas.setAttribute("aria-label", "Dunk the teabag");
    } else if (phase === "steeping" && dunk < 0) {
      dunk = 0;
      swirl = 1;
      for (let i = 0; i < 8; i++) spawnDye();
    }
  };
  canvas.addEventListener("click", act);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act();
    }
  });
  const ray = new THREE.Raycaster();
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    if (phase !== "rest") return;
    ray.setFromCamera(pointer, camera);
    hoverTarget = ray.intersectObjects([front, back, tagMesh, box]).length ? 1 : 0;
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.x = pointer.y = 0;
    hoverTarget = 0;
  });

  const bezier = (a, b, c, k) => a.clone().multiplyScalar((1 - k) ** 2).addScaledVector(b, 2 * k * (1 - k)).addScaledVector(c, k * k);
  const bagBottomY = () => bagTop.y + V(0, -BAG.l, 0).applyQuaternion(bagQ).y;
  const hangQ = (dir) => basis(dir, TOWARD);

  function move(dt) {
    t += dt;
    let pts;
    if (t < 1.0) {
      // picked up by the tag and carried high over the cup
      const k = ease(t / 1.0);
      tagPos.copy(bezier(TAG_REST, V((TAG_REST.x + HOLD.x) / 2, 24, (TAG_REST.z + HOLD.z) / 2), HOLD, k));
      tagQ.copy(TAG_REST_Q).slerp(TAG_HELD_Q, ease(t / 0.4));
      const lift = ease((t - 0.15) / 0.5);
      const sway = Math.sin(t * 7) * 0.25 * lift;
      const hang = tagPos.clone().add(V(-sway * 2, -STRING, 0));
      bagTop.copy(REST_TOP).lerp(hang, lift);
      bagQ.copy(REST_Q).slerp(hangQ(V(sway, 1, 0)), lift);
      pts = [bagTop.clone(), bagTop.clone().lerp(tagPos, 0.5).add(V(0, -1.5 * (1 - lift), 0)), tagPos.clone()];
    } else if (t < 1.9) {
      // lowered in
      const k = ease((t - 1.0) / 0.9);
      tagPos.copy(HOLD).setY(HOLD.y + (LOWERED + STRING - HOLD.y) * k);
      tagQ.copy(TAG_HELD_Q);
      const sway = Math.sin(t * 7) * 0.25 * Math.max(0, 1 - (t - 1.0) / 0.7);
      bagTop.copy(tagPos).add(V(-sway * 2, -STRING, 0));
      bagQ.copy(hangQ(V(sway, 1, 0)));
      pts = [bagTop.clone(), bagTop.clone().lerp(tagPos, 0.5), tagPos.clone()];
    } else {
      // the tag is dropped over the rim and the bag settles against the side
      const k = ease((t - 1.9) / 0.9);
      tagPos.copy(bezier(V(CUP.x, LOWERED + STRING, CUP.z), rimAt(4.4, 9.4), TAG_DRAPED, k));
      tagQ.copy(TAG_HELD_Q).slerp(TAG_DRAPED_Q, ease((t - 2.1) / 0.5));
      bagTop.copy(V(CUP.x, LOWERED, CUP.z)).lerp(LEAN_TOP, k);
      bagQ.copy(hangQ(UP)).slerp(LEAN_Q, k);
      pts = [bagTop.clone(), ...RIM().map((p, i) => bagTop.clone().lerp(tagPos, (i + 1) / 4).lerp(p, k)), tagPos.clone()];
      if (t > 2.8) phase = "steeping";
    }
    if (!plopped && bagBottomY() < WATER_Y) {
      plopped = true;
      playPlop();
      ripples.forEach((r, i) => (r.userData.t = -i * 0.25));
      swirl = 1;
    }
    setString(pts);
  }

  function steeping(dt) {
    if (dunk >= 0) {
      dunk += dt;
      const d = Math.sin(Math.min(1, dunk / 1.1) * Math.PI) * 1.2;
      bagTop.copy(LEAN_TOP).y -= d;
      tagPos.copy(TAG_DRAPED).y += d * 0.6;
      if (dunk > 1.1) dunk = -1;
    }
    setString([bagTop.clone(), ...RIM(), tagPos.clone()]);
  }

  function update(dt) {
    hover += (hoverTarget - hover) * Math.min(1, dt * 8);
    if (phase === "rest") {
      // a little lift when you hover, as if about to be picked up
      bagTop.copy(REST_TOP).y += hover * 0.35;
      tagPos.copy(TAG_REST).y += hover * 0.12;
      const pts = restString().map((p, i, a) => p.setY(p.y + hover * 0.2 * (1 - i / (a.length - 1))));
      pts[0] = bagTop.clone();
      pts[pts.length - 1] = tagPos.clone();
      setString(pts);
    } else if (phase === "moving") move(dt);
    else steeping(dt);

    bag.position.copy(bagTop);
    bag.quaternion.copy(bagQ);
    tag.position.copy(tagPos);
    tag.quaternion.copy(tagQ);

    if (plopped) {
      wet = Math.min(1, wet + dt * 0.8);
      steep += (1 - steep) * dt * (0.13 + (dunk >= 0 ? 0.15 : 0));
      if (Math.random() < dt * (6 + swirl * 20) * (1 - steep * 0.6)) spawnDye();
    }
    swirl *= Math.exp(-dt * 0.4);
    paper.color.copy(DRY).lerp(WET, wet);
    paper.roughness = 0.95 - wet * 0.3;
    const s = ease(steep);
    waterMat.attenuationColor.setRGB(1 + (TEA[0] - 1) * s, 1 + (TEA[1] - 1) * s, 1 + (TEA[2] - 1) * s);
    waterMat.attenuationDistance = 1 / (1 / 40 + s * (1 / 2.4 - 1 / 40));
    // Pale green tea is nearly the page's own yellow, so it is pushed toward
    // amber and given a little body of its own to stand apart from it.
    waterMat.color.setRGB(1 - 0.12 * s, 1 - 0.36 * s, 1 - 0.85 * s);
    waterMat.transmission = 1 - 0.3 * s;

    for (const d of dye) {
      const u = d.userData;
      if (u.life >= 1) continue;
      u.life += dt / u.span;
      const rel = u.pos.clone().sub(cupC).setY(0);
      const tangent = V(-rel.z, 0, rel.x).multiplyScalar(0.25 + swirl * 0.9);
      u.pos.addScaledVector(u.vel.clone().add(tangent), dt);
      u.pos.y = Math.max(CUP.base + CUP.floor + 0.3, Math.min(WATER_Y - 0.25, u.pos.y));
      const r = rel.length();
      const max = innerR(u.pos.y - CUP.base) - 0.6;
      if (r > max) u.pos.addScaledVector(rel.normalize(), max - r);
      d.position.copy(u.pos);
      const size = 0.8 + u.life * 2.6;
      d.scale.set(size, size, 1);
      d.material.opacity = Math.sin(u.life * Math.PI) * 0.3 * (1 - s * 0.6);
      if (u.life >= 1) d.visible = false;
    }
    for (const p of steam) {
      const u = p.userData;
      u.life += dt * u.speed;
      if (u.life >= 1) {
        u.life = 0;
        u.a = Math.random() * 6.28;
        u.r = Math.random() * 2.6;
      }
      p.position.set(CUP.x + Math.cos(u.a) * u.r + Math.sin(u.life * 4 + u.wob) * 0.6, WATER_Y + 0.4 + u.life * 7, CUP.z + Math.sin(u.a) * u.r * 0.6);
      const size = 1.5 + u.life * 4;
      p.scale.set(size, size * 1.3, 1);
      p.material.opacity = Math.sin(u.life * Math.PI) ** 1.5 * 0.08;
    }
    for (const r of ripples) {
      if (r.userData.t === null) continue;
      r.userData.t += dt;
      const k = clamp01(r.userData.t / 1.2);
      r.scale.setScalar(0.5 + k * 3);
      r.material.opacity = r.userData.t < 0 ? 0 : (1 - k) * 0.45;
      if (k >= 1) r.userData.t = null;
    }

    // a little parallax with the pointer
    pointer.ex += (pointer.x - pointer.ex) * Math.min(1, dt * 3);
    pointer.ey += (pointer.y - pointer.ey) * Math.min(1, dt * 3);
    placeCamera(dist);
  }

  // ---- framing ----
  const BOUNDS = [];
  for (const x of [-13.2, 14.4]) for (const y of [0, 12.5]) for (const z of [-5, 7]) BOUNDS.push(V(x, y, z));
  let dist = 60;
  const dirOf = (px, py) => {
    const az = 0.04 + px * 0.06;
    const el = 0.4 + py * 0.035;
    return V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  };
  function placeCamera(d, still) {
    camera.position.copy(target).addScaledVector(still ? dirOf(0, 0) : dirOf(pointer.ex, pointer.ey), d);
    camera.lookAt(target);
  }
  function frameIt() {
    const fits = (d) => {
      placeCamera(d, true);
      camera.updateMatrixWorld();
      return BOUNDS.every((p) => {
        const q = p.clone().project(camera);
        return Math.abs(q.x) < 0.98 && Math.abs(q.y) < 0.9;
      });
    };
    let lo = 10;
    let hi = 400;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    dist = hi;
  }
  function resize() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    frameIt();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let raf = 0;
  let last = performance.now();
  let shown = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    if (!shown) {
      shown = true;
      canvas.style.opacity = "1";
    }
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) m.dispose();
    });
    disposables.forEach((x) => x.dispose());
    scene.environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
