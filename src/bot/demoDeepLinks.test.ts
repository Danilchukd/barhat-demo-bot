import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDemoDeepLink, parseDemoStartPayload } from "./demoDeepLinks.js";

test("ссылка на демку содержит username бота и ID", () => {
  assert.equal(
    buildDemoDeepLink(130, "BARHATDFunBOT"),
    "https://t.me/BARHATDFunBOT?start=demo_130"
  );
  assert.equal(
    buildDemoDeepLink(1, "@BARHATDFunBOT"),
    "https://t.me/BARHATDFunBOT?start=demo_1"
  );
});

test("параметр start разбирается только для положительного ID", () => {
  assert.equal(parseDemoStartPayload("demo_130"), 130);
  assert.equal(parseDemoStartPayload("  demo_7  "), 7);
  for (const invalid of ["", "demo_0", "demo_-1", "demo_01", "demo_X", "demo_999999999999999999"]) {
    assert.equal(parseDemoStartPayload(invalid), null, invalid);
  }
});

test("нельзя сформировать ссылку с некорректными значениями", () => {
  assert.throws(() => buildDemoDeepLink(0, "BARHATDFunBOT"));
  assert.throws(() => buildDemoDeepLink(1, "not valid"));
});
