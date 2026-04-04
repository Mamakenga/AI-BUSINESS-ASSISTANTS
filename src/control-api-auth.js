"use strict";

const INTERNAL_AUTH_ROUTE_PREFIXES = Object.freeze([
  "/jobs",
  "/memories",
  "/memory",
  "/telegram",
  "/runs",
]);

function buildInternalAuthError(status, message) {
  return {
    ok: false,
    status,
    body: { error: message },
  };
}

function hasConfiguredInternalToken(expectedToken) {
  return String(expectedToken || "").trim().length > 0;
}

function authorizeInternalRequest(headers = {}, expectedToken) {
  const configuredToken = String(expectedToken || "").trim();
  if (!hasConfiguredInternalToken(configuredToken)) {
    return buildInternalAuthError(503, "CONTROL_API_INTERNAL_TOKEN is not configured");
  }

  const authorization = String(headers.authorization || "").trim();
  if (authorization !== `Bearer ${configuredToken}`) {
    return buildInternalAuthError(401, "Unauthorized internal request");
  }

  return {
    ok: true,
  };
}

function buildInternalAuthHeaders(expectedToken, headers = {}) {
  const configuredToken = String(expectedToken || "").trim();
  if (!hasConfiguredInternalToken(configuredToken)) {
    return { ...headers };
  }

  return {
    ...headers,
    authorization: `Bearer ${configuredToken}`,
  };
}

module.exports = {
  authorizeInternalRequest,
  buildInternalAuthHeaders,
  hasConfiguredInternalToken,
  INTERNAL_AUTH_ROUTE_PREFIXES,
};
