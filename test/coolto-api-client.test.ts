import assert from "node:assert/strict";
import test from "node:test";

import {
  CooltoApiClient,
  CooltoApiError,
} from "../src/api/coolto-api-client.js";

test("API client keeps the login cookie in memory for authenticated calls", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, ...(init ? { init } : {}) });

    if (url.endsWith("/v1/auth/login")) {
      return jsonResponse(
        {
          success: true,
          data: { userId: "user-1", email: "alice@example.com" },
        },
        {
          headers: {
            "set-cookie":
              "access_token=header.payload.signature; HttpOnly; Path=/; SameSite=lax",
          },
        },
      );
    }

    if (url.endsWith("/v1/users/me")) {
      const headers = new Headers(init?.headers);
      assert.equal(
        headers.get("cookie"),
        "access_token=header.payload.signature",
      );
      return jsonResponse({
        success: true,
        data: { id: "user-1", email: "alice@example.com" },
      });
    }

    if (url.endsWith("/v1/auth/logout")) {
      return jsonResponse({
        success: true,
        data: { message: "Logged out" },
      });
    }

    return jsonResponse(
      {
        success: false,
        error: { message: "Not found" },
      },
      { status: 404 },
    );
  };

  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000/",
    fetchFn,
  });

  const loginUser = await client.login({
    email: "alice@example.com",
    password: "secret",
  });
  assert.equal(loginUser.userId, "user-1");
  assert.equal(client.isAuthenticated, true);

  const currentUser = await client.getCurrentUser();
  assert.deepEqual(currentUser, {
    id: "user-1",
    email: "alice@example.com",
  });

  await client.logout();
  assert.equal(client.isAuthenticated, false);
  assert.deepEqual(
    calls.map((call) => new URL(call.url).pathname),
    ["/v1/auth/login", "/v1/users/me", "/v1/auth/logout"],
  );
});

test("API client can restore a validated session token", async () => {
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (_input, init) => {
      assert.equal(
        new Headers(init?.headers).get("cookie"),
        "access_token=restored.token.signature",
      );
      return jsonResponse({
        success: true,
        data: { id: "user-1", email: "alice@example.com" },
      });
    },
  });

  client.restoreSession("restored.token.signature");
  assert.equal(client.getSessionToken(), "restored.token.signature");
  assert.equal((await client.getCurrentUser()).id, "user-1");

  assert.throws(
    () => client.restoreSession("unsafe; cookie"),
    /格式无效/,
  );
});

test("API client reads experience lists and full details with the same session", async () => {
  const requestedUrls: URL[] = [];
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (input, init) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      assert.equal(
        new Headers(init?.headers).get("cookie"),
        "access_token=experience.session.token",
      );

      if (url.pathname.endsWith("/exp-1")) {
        return jsonResponse({
          success: true,
          data: {
            ...experienceSummary,
            currentRevision: experienceRevision,
            revisions: [experienceRevision],
          },
        });
      }

      return jsonResponse({
        success: true,
        data: {
          items: [experienceSummary],
          nextCursor: "exp-next",
        },
      });
    },
  });
  client.restoreSession("experience.session.token");

  const searchResult = await client.searchExperiences({
    q: "agent",
    category: "project",
    tags: ["typescript", "ai"],
    limit: 5,
    cursor: "exp-cursor",
  });
  const detail = await client.getExperience("exp-1");

  assert.equal(searchResult.items[0]?.id, "exp-1");
  assert.equal(detail.revisions[0]?.content, "Built a local agent.");

  const searchUrl = requestedUrls[0];
  assert.ok(searchUrl);
  assert.equal(searchUrl.pathname, "/v1/product/experiences");
  assert.equal(searchUrl.searchParams.get("q"), "agent");
  assert.equal(searchUrl.searchParams.get("category"), "project");
  assert.deepEqual(searchUrl.searchParams.getAll("tags"), [
    "typescript",
    "ai",
  ]);
  assert.equal(searchUrl.searchParams.get("limit"), "5");
  assert.equal(searchUrl.searchParams.get("cursor"), "exp-cursor");
  assert.equal(
    requestedUrls[1]?.pathname,
    "/v1/product/experiences/exp-1",
  );
});

test("API client maps camelCase input to the backend experience create contract", async () => {
  let requestBody: unknown;
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        success: true,
        data: {
          ...experienceSummary,
          currentRevision: experienceRevision,
          revisions: [],
        },
      });
    },
  });
  client.restoreSession("create.session.token");

  await client.createExperience({
    category: "project",
    title: "Local Agent",
    content: "Built a local agent.",
    startDate: "2026-01",
    endDate: "present",
    tags: ["TypeScript"],
  });

  assert.deepEqual(requestBody, {
    category: "project",
    title: "Local Agent",
    content: "Built a local agent.",
    organization: null,
    role: null,
    location: null,
    start_date: "2026-01",
    end_date: "present",
    tags: ["TypeScript"],
  });
});

test("API client exposes backend login errors without retaining a session", async () => {
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async () =>
      jsonResponse(
        {
          success: false,
          error: {
            code: "unauthorized",
            message: "Invalid email or password",
          },
        },
        { status: 401 },
      ),
  });

  await assert.rejects(
    client.login({ email: "alice@example.com", password: "wrong" }),
    (error: unknown) =>
      error instanceof CooltoApiError &&
      error.status === 401 &&
      error.message === "Invalid email or password",
  );
  assert.equal(client.isAuthenticated, false);
});

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
}

const experienceRevision = {
  id: "rev-1",
  experienceId: "exp-1",
  content: "Built a local agent.",
  source: "manual",
  revisionHash: "hash",
  factBankStatus: "completed",
  createdAt: "2026-07-01T00:00:00Z",
};

const experienceSummary = {
  id: "exp-1",
  category: "project",
  title: "Local Agent",
  organization: null,
  role: "Developer",
  location: null,
  startDate: "2026-01-01",
  endDate: null,
  tags: ["typescript", "ai"],
  status: "active",
  currentRevisionId: "rev-1",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
