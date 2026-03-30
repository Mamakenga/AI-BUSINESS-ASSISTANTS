"use strict";

function buildInternalAuthError(status, message) {
  return {
    ok: false,
    status,
    body: { error: message },
  };
}

function authorizeInternalRequest(headers = {}, expectedToken) {
  const configuredToken = String(expectedToken || "").trim();
  if (!configuredToken) {
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

module.exports = {
  authorizeInternalRequest,
};
