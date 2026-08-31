import assert from "node:assert/strict";
import test from "node:test";

import { JdWriterApi } from "../src/api/jd-writer-api.js";
import type { JdCreateInput } from "../src/api/types.js";

function makeServerResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      id: "jd-server-001",
      title: "后端工程师",
      company: "字节跳动",
      targetRole: null,
      sourceKind: "pasted",
      sourceUrl: null,
      rawText: "原始文本",
      requirements: [],
      jdHash: "abc123",
      requirementMapId: null,
      requirementsOrigin: "extracted",
      sourceThreadId: null,
      entityVersion: 1,
      deletedAt: null,
      createdAt: "2026-07-24T00:00:00Z",
      updatedAt: "2026-07-24T00:00:00Z",
      ...overrides,
    },
  };
}

function makeRequester(
  handler: (url: string, init: RequestInit) => Promise<Response>,
) {
  return {
    request: async <T>(path: string, init: RequestInit): Promise<T> => {
      const res = await handler(path, init);
      const body = await res.json() as { data: T };
      return body.data;
    },
  };
}

test("builds snake_case POST body with title and raw_text", async () => {
  let captured: { url: string; body: unknown } | undefined;
  const requester = makeRequester(async (url, init) => {
    captured = { url, body: JSON.parse(init.body as string) };
    return new Response(JSON.stringify(makeServerResponse()), { status: 200 });
  });
  const api = new JdWriterApi(requester as never);

  await api.createJd({ title: "后端工程师", rawText: "职位详情" });

  assert.equal(captured?.url, "/v1/product/jds");
  assert.equal((captured?.body as Record<string, unknown>)["title"], "后端工程师");
  assert.equal((captured?.body as Record<string, unknown>)["raw_text"], "职位详情");
});

test("sends company and target_role in snake_case", async () => {
  let body: Record<string, unknown> | undefined;
  const requester = makeRequester(async (_url, init) => {
    body = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify(makeServerResponse()), { status: 200 });
  });
  const api = new JdWriterApi(requester as never);

  await api.createJd({
    title: "后端工程师",
    rawText: "职位详情",
    company: "字节跳动",
    targetRole: "SRE",
    sourceKind: "browser",
    sourceUrl: "https://jobs.example/backend",
  });

  assert.equal(body?.["company"], "字节跳动");
  assert.equal(body?.["target_role"], "SRE");
  assert.equal(body?.["source_kind"], "browser");
  assert.equal(body?.["source_url"], "https://jobs.example/backend");
});

test("sends company and target_role as null when omitted", async () => {
  let body: Record<string, unknown> | undefined;
  const requester = makeRequester(async (_url, init) => {
    body = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify(makeServerResponse()), { status: 200 });
  });
  const api = new JdWriterApi(requester as never);

  await api.createJd({ title: "岗位", rawText: "文本" });

  assert.equal(body?.["company"], null);
  assert.equal(body?.["target_role"], null);
  assert.equal(body?.["source_kind"], "pasted");
  assert.equal(body?.["source_url"], null);
});

test("maps requirements to snake_case including v2 fields", async () => {
  let body: Record<string, unknown> | undefined;
  const serverReqs = [
    {
      id: "req-server-1",
      text: "5年以上经验",
      category: "experience",
      importance: "high",
      keywords: ["React"],
      weight: null,
      v2Importance: "must_have",
      v2Category: "technology",
    },
  ];
  const requester = makeRequester(async (_url, init) => {
    body = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify(makeServerResponse({ requirements: serverReqs })), {
      status: 200,
    });
  });
  const api = new JdWriterApi(requester as never);
  const input: JdCreateInput = {
    title: "前端工程师",
    rawText: "文本",
    requirements: [
      {
        text: "5年以上经验",
        category: "experience",
        importance: "high",
        keywords: ["React"],
        v2Importance: "must_have",
        v2Category: "technology",
      },
    ],
  };

  await api.createJd(input);

  const sentReqs = body?.["requirements"] as Array<Record<string, unknown>>;
  assert.equal(sentReqs?.[0]?.["text"], "5年以上经验");
  assert.equal(sentReqs?.[0]?.["category"], "experience");
  assert.equal(sentReqs?.[0]?.["v2_importance"], "must_have");
  assert.equal(sentReqs?.[0]?.["v2_category"], "technology");
});

test("sanitizes out-of-enum v2 fields to null before sending", async () => {
  let body: Record<string, unknown> | undefined;
  const requester = makeRequester(async (_url, init) => {
    body = JSON.parse(init.body as string) as Record<string, unknown>;
    return new Response(JSON.stringify(makeServerResponse()), { status: 200 });
  });
  const api = new JdWriterApi(requester as never);

  await api.createJd({
    title: "前端工程师",
    rawText: "文本",
    requirements: [
      {
        text: "5年以上经验",
        category: "experience",
        importance: "high",
        keywords: [],
        v2Importance: "critical" as never,
        v2Category: "technical" as never,
      },
    ],
  });

  const sentReqs = body?.["requirements"] as Array<Record<string, unknown>>;
  assert.equal(sentReqs?.[0]?.["v2_importance"], null);
  assert.equal(sentReqs?.[0]?.["v2_category"], null);
});

test("normalizes server response into JdRecord with camelCase fields", async () => {
  const requester = makeRequester(async () =>
    new Response(
      JSON.stringify(
        makeServerResponse({ id: "jd-42", title: "产品经理", jdHash: "hash-xyz" }),
      ),
      { status: 200 },
    ),
  );
  const api = new JdWriterApi(requester as never);

  const result = await api.createJd({ title: "产品经理", rawText: "JD 内容" });

  assert.equal(result.id, "jd-42");
  assert.equal(result.title, "产品经理");
  assert.equal(result.jdHash, "hash-xyz");
});

test("passes AbortSignal to requester", async () => {
  let receivedInit: RequestInit | undefined;
  const requester = makeRequester(async (_url, init) => {
    receivedInit = init;
    return new Response(JSON.stringify(makeServerResponse()), { status: 200 });
  });
  const api = new JdWriterApi(requester as never);
  const controller = new AbortController();

  await api.createJd({ title: "岗位", rawText: "文本" }, controller.signal);

  assert.equal(receivedInit?.signal, controller.signal);
});
