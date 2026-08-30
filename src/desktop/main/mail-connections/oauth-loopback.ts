import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

import { shell } from "electron";

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export async function runOAuthLoopback(input: {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scopes: string[];
  authorizationParameters?: Record<string, string>;
  openExternal?: (url: string) => Promise<void>;
}): Promise<OAuthTokenResponse> {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = await listenForCallback(state);
  try {
    const authorization = new URL(input.authorizationEndpoint);
    authorization.search = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: callback.redirectUri,
      response_type: "code",
      scope: input.scopes.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...input.authorizationParameters,
    }).toString();
    await (input.openExternal ?? shell.openExternal)(authorization.toString());
    const code = await callback.result;
    return exchangeCode({ ...input, redirectUri: callback.redirectUri, code, verifier });
  } finally {
    callback.close();
  }
}

async function exchangeCode(input: {
  tokenEndpoint: string; clientId: string; scopes: string[];
  redirectUri: string; code: string; verifier: string;
}): Promise<OAuthTokenResponse> {
  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId, code: input.code,
      redirect_uri: input.redirectUri, grant_type: "authorization_code",
      code_verifier: input.verifier, scope: input.scopes.join(" "),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OAuth token exchange failed (${response.status})`);
  return readTokens(value, true);
}

export async function refreshOAuthToken(input: {
  tokenEndpoint: string; clientId: string; refreshToken: string; scopes: string[];
}): Promise<OAuthTokenResponse> {
  const response = await fetch(input.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId, refresh_token: input.refreshToken,
      grant_type: "refresh_token", scope: input.scopes.join(" "),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OAuth token refresh failed (${response.status})`);
  const tokens = readTokens(value, false);
  return { ...tokens, refreshToken: tokens.refreshToken || input.refreshToken };
}

function readTokens(value: Record<string, unknown>, requireRefresh: boolean): OAuthTokenResponse {
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : "";
  const expiresIn = typeof value.expires_in === "number" ? value.expires_in : 3600;
  if (!accessToken || requireRefresh && !refreshToken) {
    throw new Error("OAuth response 缺少 access/refresh token");
  }
  return {
    accessToken, refreshToken, expiresIn,
    scope: typeof value.scope === "string" ? value.scope : "",
  };
}

async function listenForCallback(expectedState: string): Promise<{
  redirectUri: string; result: Promise<string>; close: () => void;
}> {
  let resolveCode!: (value: string) => void;
  let rejectCode!: (error: Error) => void;
  const result = new Promise<string>((resolve, reject) => {
    resolveCode = resolve; rejectCode = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/oauth/callback") {
      response.writeHead(404).end(); return;
    }
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (state !== expectedState || !code || error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
        .end("Authorization failed. Return to Coolto.");
      rejectCode(new Error(error ? `OAuth authorization failed: ${error}` : "OAuth state/code 无效"));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("Authorization complete. You can close this window and return to Coolto.");
    resolveCode(code);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("OAuth loopback listener failed");
  const timeout = setTimeout(() => rejectCode(new Error("OAuth authorization timed out")), 300_000);
  return {
    redirectUri: `http://127.0.0.1:${address.port}/oauth/callback`,
    result: result.finally(() => clearTimeout(timeout)),
    close: () => server.close(),
  };
}
