/**
 * Pure JavaScript QR Code Generator (Zero-dependency SVG generator)
 * Encodes alphanumeric / byte data into standard QR Code matrix and returns SVG string.
 */

// QR Code version 1 to 10 capacities (Byte mode, Error Correction Level M)
const QR_CAPACITIES_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];

// Galois Field GF(256) tables for Reed-Solomon Error Correction
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(function initGalois() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
  LOG_TABLE[0] = 0;
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsComputePoly(ecCount) {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = [1];
    const root = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] || 0) ^ gfMultiply(poly[j], root);
      next[j + 1] = (next[j + 1] || 0) ^ poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const genPoly = rsComputePoly(ecCount);
  const msg = new Uint8Array(data.length + ecCount);
  msg.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < genPoly.length; j++) {
        msg[i + j] ^= gfMultiply(genPoly[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// Table of EC blocks and codons for Level M
const EC_SPECS_M = {
  1: { totalCodewords: 26, dataCodewords: 16, ecCodewords: 10, blocks: [[1, 16]] },
  2: { totalCodewords: 44, dataCodewords: 28, ecCodewords: 16, blocks: [[1, 28]] },
  3: { totalCodewords: 70, dataCodewords: 44, ecCodewords: 26, blocks: [[1, 44]] },
  4: { totalCodewords: 100, dataCodewords: 64, ecCodewords: 18, blocks: [[2, 32]] },
  5: { totalCodewords: 134, dataCodewords: 86, ecCodewords: 24, blocks: [[2, 43]] },
  6: { totalCodewords: 172, dataCodewords: 108, ecCodewords: 16, blocks: [[4, 27]] },
  7: { totalCodewords: 196, dataCodewords: 124, ecCodewords: 18, blocks: [[4, 31]] },
  8: { totalCodewords: 242, dataCodewords: 154, ecCodewords: 22, blocks: [[2, 38], [2, 39]] },
  9: { totalCodewords: 292, dataCodewords: 182, ecCodewords: 22, blocks: [[3, 36], [2, 37]] },
  10: { totalCodewords: 346, dataCodewords: 216, ecCodewords: 26, blocks: [[4, 43], [1, 44]] }
};

// Alignment pattern locations by version
const ALIGNMENT_PATTERN_POS = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];

function selectVersion(byteCount) {
  for (let v = 1; v <= 10; v++) {
    if (EC_SPECS_M[v] && byteCount <= EC_SPECS_M[v].dataCodewords - 3) {
      return v;
    }
  }
  return 10;
}

/**
 * Encodes text into a QR Code 2D boolean matrix (Level M)
 */
function generateQrMatrix(text) {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const version = selectVersion(rawBytes.length);
  const spec = EC_SPECS_M[version] || EC_SPECS_M[10];
  const size = 17 + version * 4;

  // 1. Bitstream encoding in Byte mode (0100)
  const bitStream = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitStream.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(rawBytes.length, version <= 9 ? 8 : 16); // Character count indicator
  for (const b of rawBytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zeroes)
  const totalBits = spec.dataCodewords * 8;
  const termLen = Math.min(4, totalBits - bitStream.length);
  pushBits(0, termLen);

  // Pad to next byte boundary
  while (bitStream.length % 8 !== 0) {
    bitStream.push(0);
  }

  // Pad codewords (0xEC, 0x11)
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitStream.length < totalBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte codewords
  const dataCodewords = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < spec.dataCodewords; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitStream[i * 8 + j];
    }
    dataCodewords[i] = b;
  }

  // Compute Reed-Solomon EC for each block
  const blocks = [];
  let offset = 0;
  for (const [count, len] of spec.blocks) {
    for (let b = 0; b < count; b++) {
      const slice = dataCodewords.slice(offset, offset + len);
      offset += len;
      const ec = rsEncode(slice, spec.ecCodewords);
      blocks.push({ data: slice, ec });
    }
  }

  // Interleave data codewords and EC codewords
  const finalCodewords = [];
  const maxDataLen = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) finalCodewords.push(b.data[i]);
    }
  }
  for (let i = 0; i < spec.ecCodewords; i++) {
    for (const b of blocks) {
      finalCodewords.push(b.ec[i]);
    }
  }

  // Initialize Matrix and Reserved flags
  const matrix = Array.from({ length: size }, () => new Array(size).fill(false));
  const isReserved = Array.from({ length: size }, () => new Array(size).fill(false));

  function setModule(r, c, val, reserved = true) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = Boolean(val);
      if (reserved) isReserved[r][c] = true;
    }
  }

  // Finder Patterns
  function addFinder(topRow, leftCol) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(topRow + r, leftCol + c, isBorder || isCenter);
      }
    }
    // Separator rings
    for (let r = -1; r <= 7; r++) {
      setModule(topRow + r, leftCol - 1, false);
      setModule(topRow + r, leftCol + 7, false);
    }
    for (let c = -1; c <= 7; c++) {
      setModule(topRow - 1, leftCol + c, false);
      setModule(topRow + 7, leftCol + c, false);
    }
  }

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Alignment patterns
  const alignCoords = ALIGNMENT_PATTERN_POS[version] || [];
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if (isReserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isOuter = Math.abs(dr) === 2 || Math.abs(dc) === 2;
          const isCore = dr === 0 && dc === 0;
          setModule(r + dr, c + dc, isOuter || isCore);
        }
      }
    }
  }

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    setModule(8, i, false);
    setModule(i, 8, false);
    setModule(8, size - 1 - i, false);
    setModule(size - 1 - i, 8, false);
  }
  setModule(8, 8, false);

  // Place Codewords into Data Area
  const finalBits = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((cw >> i) & 1);
    }
  }
  // Remainder bits
  const remainderBitsMap = { 2: 7, 3: 7, 4: 7, 5: 7, 6: 7 };
  const rem = remainderBitsMap[version] || 0;
  for (let i = 0; i < rem; i++) finalBits.push(0);

  let bitIdx = 0;
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = [];
    if (up) {
      for (let r = size - 1; r >= 0; r--) rows.push(r);
    } else {
      for (let r = 0; r < size; r++) rows.push(r);
    }
    up = !up;

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isReserved[r][c]) {
          const bitVal = bitIdx < finalBits.length ? finalBits[bitIdx] : 0;
          bitIdx++;
          // Apply Standard Mask Pattern 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bitVal === 1) ^ mask;
        }
      }
    }
  }

  // Write Format Information (Level M = 00, Mask 0 = 000 -> 00000 ^ 101010000010010 = format bits)
  // Mask 0 + Level M format bits: 101010000010010 (BCH code: 0x5412)
  const formatBits = 0x5412;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    // Around top-left finder
    if (i <= 5) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i === 7) setModule(8, 8, bit);
    else if (i === 8) setModule(7, 8, bit);
    else setModule(14 - i, 8, bit);

    // Around other finders
    if (i < 8) setModule(size - 1 - i, 8, bit);
    else setModule(8, size - 15 + i, bit);
  }

  return matrix;
}

/**
 * Returns clean, responsive SVG string for a given text/URL
 */
function generateQrSvg(text, { size = 300, margin = 2, fill = "#171719", background = "#FFFFFF" } = {}) {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const totalModules = matrixSize + margin * 2;
  const cellSize = (size / totalModules).toFixed(3);

  let paths = "";
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        paths += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code">
  <rect width="100%" height="100%" fill="${background}"/>
  <path d="${paths.trim()}" fill="${fill}"/>
</svg>`;
}

module.exports = {
  generateQrMatrix,
  generateQrSvg
};

