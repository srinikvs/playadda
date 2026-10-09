import assert from "node:assert/strict";
import test from "node:test";
import { hotp, totp, verifyTotp } from "./totp.mjs";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("RFC 6238 SHA1 vector at T=59", () => {
  assert.equal(hotp(RFC_SECRET, Math.floor(59 / 30), 8), "94287082");
});

test("verify accepts current code and rejects a wrong code", () => {
  const secret = "PLAYADDAEXAMPLEONLY";
  const code = totp(secret, 1_700_000_000_000);
  assert.equal(verifyTotp(secret, code, 1_700_000_000_000), true);
  assert.equal(verifyTotp(secret, code, 1_700_000_000_000 + 30_000), true);
  assert.equal(verifyTotp(secret, "000000", 1_700_000_000_000), false);
  assert.equal(verifyTotp(secret, "12", 1_700_000_000_000), false);
});
