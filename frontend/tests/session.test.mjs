import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession, SESSION_SECONDS } from "../lib/session.ts";
const key = "synthetic-session-test-key-at-least-32-chars";
const user = { actor_id: "staff", username: "staff", name: "Test staff", role: "kitchen_staff" };
test("signed sessions expire and reject tampered claims or keys", () => {
  const token = signSession(user, key, 1000000);
  assert.equal(verifySession(token, key, 1000001).actor_id, "staff");
  assert.equal(verifySession(token, key, 1000000 + SESSION_SECONDS * 1000), null);
  assert.equal(verifySession(token, "wrong-key-at-least-thirty-two-characters", 1000001), null);
  const [body, signature] = token.split(".");
  const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), role: "supervisor" })).toString("base64url");
  assert.equal(verifySession(`${changed}.${signature}`, key, 1000001), null);
  assert.equal(verifySession(undefined, key), null);
  assert.throws(() => signSession(user, "short"));
});
