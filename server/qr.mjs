const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsRemainder(data, eccLen) {
  const gen = [1];
  for (let i = 0; i < eccLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], EXP[i]);
    }
    gen.splice(0, gen.length, ...next);
  }
  const res = data.concat(new Array(eccLen).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (!coef) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

const ALIGN = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
};

const SPEC = {
  1: { ecc: 10, g1: [1, 16], g2: [0, 0] },
  2: { ecc: 16, g1: [1, 28], g2: [0, 0] },
  3: { ecc: 26, g1: [1, 44], g2: [0, 0] },
  4: { ecc: 18, g1: [2, 32], g2: [0, 0] },
  5: { ecc: 24, g1: [2, 43], g2: [0, 0] },
  6: { ecc: 16, g1: [4, 27], g2: [0, 0] },
  7: { ecc: 18, g1: [4, 31], g2: [0, 0] },
  8: { ecc: 22, g1: [2, 38], g2: [2, 39] },
  9: { ecc: 22, g1: [3, 36], g2: [2, 37] },
  10: { ecc: 26, g1: [4, 43], g2: [1, 44] },
  11: { ecc: 30, g1: [1, 50], g2: [4, 51] },
  12: { ecc: 22, g1: [6, 36], g2: [2, 37] },
};

function dataCodewords(version) {
  const spec = SPEC[version];
  return spec.g1[0] * spec.g1[1] + spec.g2[0] * spec.g2[1];
}

function encodeBytes(text, version) {
  const data = Buffer.from(String(text), "utf8");
  const capacity = dataCodewords(version);
  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);
  push(data.length, version <= 9 ? 8 : 16);
  for (const byte of data) push(byte, 8);
  const capBits = capacity * 8;
  if (bits.length > capBits) return null;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    bytes.push(value);
  }
  for (let pad = 0; bytes.length < capacity; pad++) bytes.push(pad % 2 === 0 ? 0xec : 0x11);
  return bytes;
}

function interleave(version, bytes) {
  const spec = SPEC[version];
  const blocks = [];
  let offset = 0;
  for (let i = 0; i < spec.g1[0]; i++) {
    blocks.push(bytes.slice(offset, offset + spec.g1[1]));
    offset += spec.g1[1];
  }
  for (let i = 0; i < spec.g2[0]; i++) {
    blocks.push(bytes.slice(offset, offset + spec.g2[1]));
    offset += spec.g2[1];
  }
  const ecc = blocks.map((block) => rsRemainder(block, spec.ecc));
  const out = [];
  const maxData = Math.max(...blocks.map((block) => block.length));
  for (let i = 0; i < maxData; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < spec.ecc; i++) {
    for (const block of ecc) out.push(block[i]);
  }
  return out;
}

function empty(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function markFinder(modules, reserved, row, col) {
  const size = modules.length;
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || x < 0 || y >= size || x >= size) continue;
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      modules[y][x] = inside && (edge || core) ? 1 : 0;
      reserved[y][x] = 1;
    }
  }
}

function markAlignment(modules, reserved, cy, cx) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      modules[cy + r][cx + c] = dark ? 1 : 0;
      reserved[cy + r][cx + c] = 1;
    }
  }
}

function overlapsReserved(reserved, cy, cx) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      if (reserved[cy + r]?.[cx + c]) return true;
    }
  }
  return false;
}

function formatBits(mask) {
  const data = mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function bitAt(value, index) {
  return (value >>> index) & 1;
}

function drawFormat(modules, reserved, mask) {
  const bits = formatBits(mask);
  const size = modules.length;
  const set = (x, y, bit) => {
    modules[y][x] = bit;
    reserved[y][x] = 1;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bitAt(bits, i));
  set(8, 7, bitAt(bits, 6));
  set(8, 8, bitAt(bits, 7));
  set(7, 8, bitAt(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bitAt(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bitAt(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bitAt(bits, i));
  set(8, size - 8, 1);
}

function reserveFormat(reserved) {
  const size = reserved.length;
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      reserved[8][i] = 1;
      reserved[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = 1;
    reserved[size - 1 - i][8] = 1;
  }
}

function drawVersion(modules, reserved, version) {
  if (version < 7) return;
  const bits = versionBits(version);
  const size = modules.length;
  for (let i = 0; i < 18; i++) {
    const bit = bitAt(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = bit;
    modules[a][b] = bit;
    reserved[b][a] = 1;
    reserved[a][b] = 1;
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return ((x + y) & 1) === 0;
    case 1: return (y & 1) === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function penalty(modules) {
  const size = modules.length;
  let score = 0;
  const run = (get) => {
    for (let i = 0; i < size; i++) {
      let streak = 1;
      let prev = get(i, 0);
      for (let j = 1; j < size; j++) {
        const bit = get(i, j);
        if (bit === prev) streak++;
        else {
          if (streak >= 5) score += 3 + (streak - 5);
          streak = 1;
          prev = bit;
        }
      }
      if (streak >= 5) score += 3 + (streak - 5);
    }
  };
  run((row, col) => modules[row][col]);
  run((col, row) => modules[row][col]);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const bit = modules[y][x];
      if (bit === modules[y][x + 1] && bit === modules[y + 1][x] && bit === modules[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of modules) for (const bit of row) dark += bit;
  score += Math.floor(Math.abs((dark * 100 / (size * size)) - 50) / 5) * 10;
  return score;
}

function buildMatrix(version, codewords) {
  const size = 17 + 4 * version;
  const base = empty(size);
  const reserved = empty(size);
  markFinder(base, reserved, 0, 0);
  markFinder(base, reserved, 0, size - 7);
  markFinder(base, reserved, size - 7, 0);
  const aligns = ALIGN[version] || [];
  for (const cy of aligns) {
    for (const cx of aligns) {
      if (!overlapsReserved(reserved, cy, cx)) markAlignment(base, reserved, cy, cx);
    }
  }
  for (let i = 0; i < size; i++) {
    if (!reserved[6][i]) {
      base[6][i] = i % 2 === 0 ? 1 : 0;
      reserved[6][i] = 1;
    }
    if (!reserved[i][6]) {
      base[i][6] = i % 2 === 0 ? 1 : 0;
      reserved[i][6] = 1;
    }
  }
  base[size - 8][8] = 1;
  reserved[size - 8][8] = 1;
  reserveFormat(reserved);
  drawVersion(base, reserved, version);

  const bits = [];
  for (const word of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((word >> i) & 1);
  }
  let cursor = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x]) continue;
        base[y][x] = cursor < bits.length ? bits[cursor] : 0;
        cursor++;
      }
    }
  }

  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const modules = base.map((row) => row.slice());
    const taken = reserved.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!taken[y][x] && maskBit(mask, x, y)) modules[y][x] ^= 1;
      }
    }
    drawFormat(modules, taken, mask);
    const score = penalty(modules);
    if (score < bestScore) {
      bestScore = score;
      best = modules;
    }
  }
  return best;
}

export function qrMatrix(text) {
  const bytes = Buffer.from(String(text), "utf8");
  for (let version = 1; version <= 12; version++) {
    const data = encodeBytes(bytes.toString("utf8"), version);
    if (!data) continue;
    return buildMatrix(version, interleave(version, data));
  }
  throw new Error("setup QR is too long");
}

export function qrSvg(text) {
  const modules = qrMatrix(text);
  const quiet = 4;
  const size = modules.length + quiet * 2;
  let path = "";
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (modules[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Authenticator setup QR code"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#111" d="${path}"/></svg>`;
}
