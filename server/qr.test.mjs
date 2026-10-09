import assert from "node:assert/strict";
import test from "node:test";
import { qrMatrix, qrSvg } from "./qr.mjs";

test("setup QR is a square matrix with finder frames", () => {
  const text = "otpauth://totp/Playadda:srini?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Playadda";
  const matrix = qrMatrix(text);
  assert.equal(matrix.length, matrix[0].length);
  assert.ok(matrix.length >= 21);
  assert.equal(matrix[0][0], 1);
  assert.equal(matrix[0][6], 1);
  assert.equal(matrix[6][0], 1);
  assert.equal(matrix[3][3], 1);
  const svg = qrSvg(text);
  assert.match(svg, /^<svg/);
  assert.match(svg, /<path/);
  assert.equal(svg.includes(text), false);
});
