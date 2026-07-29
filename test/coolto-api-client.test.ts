import assert from "node:assert/strict";
import test from "node:test";

import {
  CooltoApiClient,
  CooltoApiError,
} from "../src/api/coolto-api-client.js";
import { ApiContractError } from "../src/api/normalizers.js";

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

test("API client reads profile and versioned JD assets", async () => {
  const requestedUrls: URL[] = [];
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (input) => {
      const url = new URL(String(input));
      requestedUrls.push(url);
      if (url.pathname === "/v1/users/me/profile") {
        return jsonResponse({ success: true, data: userProfile });
      }
      if (url.pathname === "/v1/product/jds/jd-1") {
        return jsonResponse({ success: true, data: jdRecord });
      }
      return jsonResponse({
        success: true,
        data: { items: [jdRecord], nextCursor: "jd-next" },
      });
    },
  });
  client.restoreSession("profile.jd.session");

  assert.equal((await client.getUserProfile()).fullName, "Alice Chen");
  const list = await client.listJds({ limit: 5, cursor: "jd-cursor" });
  assert.equal(list.items[0]?.requirements[0]?.id, "req-1");
  assert.equal((await client.getJd("jd-1")).jdHash, "jd-hash");
  assert.equal(requestedUrls[1]?.searchParams.get("limit"), "5");
  assert.equal(requestedUrls[1]?.searchParams.get("cursor"), "jd-cursor");
  assert.equal(requestedUrls[2]?.pathname, "/v1/product/jds/jd-1");
  await assert.rejects(client.getJd("   "), /jdId 不能为空/);
});

test("API client maps camelCase input to the backend experience create contract", async () => {
  let requestBody: unknown;
  const requestedPaths: string[] = [];
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async (input, init) => {
      requestedPaths.push(new URL(String(input)).pathname);
      if (init?.method === "POST") {
        requestBody = JSON.parse(String(init.body));
      }
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
      status: "active",
  });
  assert.deepEqual(requestedPaths, [
    "/v1/product/experiences",
    `/v1/product/experiences/${experienceSummary.id}`,
  ]);
});

test("new source readers fail closed on malformed API contracts", async () => {
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async () =>
      jsonResponse({
        success: true,
        data: { ...userProfile, targetRoles: null },
      }),
  });
  client.restoreSession("contract.session.token");
  await assert.rejects(
    client.getUserProfile(),
    (error: unknown) =>
      error instanceof ApiContractError && /profile\.targetRoles/.test(error.message),
  );
});

test("experience readers fail closed on malformed runtime contracts", async () => {
  const client = new CooltoApiClient({
    baseUrl: "http://localhost:8000",
    fetchFn: async () =>
      jsonResponse({
        success: true,
        data: {
          ...experienceSummary,
          category: "invented-category",
          currentRevision: experienceRevision,
          revisions: [experienceRevision],
        },
      }),
  });
  client.restoreSession("experience.contract.session");

  await assert.rejects(
    client.getExperience("exp-1"),
    (error: unknown) =>
      error instanceof ApiContractError && /category/.test(error.message),
  );
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
  entityVersion: 1,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

const userProfile = {
  fullName: "Alice Chen",
  email: "alice@example.com",
  phone: "+852 1234 5678",
  location: "Hong Kong",
  linkedinUrl: null,
  githubUrl: null,
  personalWebsite: null,
  currentTitle: null,
  currentCompany: null,
  yearsOfExperience: 2,
  careerStage: "early_career",
  targetRoles: ["Product Manager"],
  targetIndustries: [],
  targetLocations: ["Hong Kong"],
  preferredLanguage: "zh-CN",
  resumeStyle: "standard",
};

const jdRecord = {
  id: "jd-1",
  title: "Product Manager",
  company: "Example",
  targetRole: "Product Manager",
  rawText: "Build reliable data products.",
  requirements: [
    {
      id: "req-1",
      text: "Experience with data products",
      category: "domain",
      importance: "high",
      keywords: ["data"],
      weight: 0.9,
      v2Importance: "must_have",
      v2Category: "domain",
    },
  ],
  jdHash: "jd-hash",
  requirementMapId: "map-1",
  requirementsOrigin: "parsed",
  sourceThreadId: null,
  entityVersion: 1,
  deletedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-02T00:00:00Z",
};
