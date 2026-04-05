"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeLooseOptionalString,
  normalizeNullableString,
  normalizeOptionalString,
  normalizeRequiredString,
} = require("../src/string-normalizers");

test("normalizeRequiredString trims and rejects empty values", () => {
  assert.equal(normalizeRequiredString("  hello  ", "field"), "hello");
  assert.throws(() => normalizeRequiredString("   ", "field"), /field is required/);
});

test("normalizeOptionalString keeps non-empty falsy-looking values", () => {
  assert.equal(normalizeOptionalString("  value "), "value");
  assert.equal(normalizeOptionalString(0), "0");
  assert.equal(normalizeOptionalString(false), "false");
  assert.equal(normalizeOptionalString("   "), null);
  assert.equal(normalizeOptionalString(undefined), null);
  assert.equal(normalizeOptionalString(null), null);
});

test("normalizeNullableString preserves undefined while trimming nullable values", () => {
  assert.equal(normalizeNullableString(undefined), undefined);
  assert.equal(normalizeNullableString(null), null);
  assert.equal(normalizeNullableString("  value "), "value");
  assert.equal(normalizeNullableString("   "), null);
});

test("normalizeLooseOptionalString treats empty and falsy non-strings as absent", () => {
  assert.equal(normalizeLooseOptionalString("  value "), "value");
  assert.equal(normalizeLooseOptionalString("   "), null);
  assert.equal(normalizeLooseOptionalString(undefined), null);
  assert.equal(normalizeLooseOptionalString(null), null);
  assert.equal(normalizeLooseOptionalString(0), null);
  assert.equal(normalizeLooseOptionalString(false), null);
});
