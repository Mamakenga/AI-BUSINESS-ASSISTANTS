"use strict";

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLooseOptionalString(value) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

module.exports = {
  normalizeLooseOptionalString,
  normalizeOptionalString,
  normalizeRequiredString,
};
