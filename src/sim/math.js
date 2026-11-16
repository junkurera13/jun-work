// Tiny vector / quaternion helpers (column-major 3x3 matrices).

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

export function quatFromAxisAngle(ax, ay, az, angle) {
  const l = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(angle / 2) / l;
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

export function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatConj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Integrate an angular velocity (world space, rad/s) into a quaternion. */
export function quatIntegrate(q, wx, wy, wz, dt) {
  const w = Math.hypot(wx, wy, wz);
  if (w < 1e-8) return q;
  return quatNormalize(quatMul(quatFromAxisAngle(wx, wy, wz, w * dt), q));
}

export function mat3FromQuat(q) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;
  return [
    1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy),
    2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx),
    2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy),
  ];
}

// m * v (column-major)
export function mulMat3(m, x, y, z) {
  return {
    x: m[0] * x + m[3] * y + m[6] * z,
    y: m[1] * x + m[4] * y + m[7] * z,
    z: m[2] * x + m[5] * y + m[8] * z,
  };
}

// transpose(m) * v
export function mulMat3T(m, x, y, z) {
  return {
    x: m[0] * x + m[1] * y + m[2] * z,
    y: m[3] * x + m[4] * y + m[5] * z,
    z: m[6] * x + m[7] * y + m[8] * z,
  };
}

// transpose(a) * b
export function mat3TMul(a, b) {
  const out = new Array(9);
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[c * 3 + r] = a[r * 3] * b[c * 3] + a[r * 3 + 1] * b[c * 3 + 1] + a[r * 3 + 2] * b[c * 3 + 2];
    }
  }
  return out;
}

export function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}
