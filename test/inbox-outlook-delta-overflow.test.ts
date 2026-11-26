import assert from "node:assert/strict";
import test from "node:test";

import { OutlookInboxAdapter } from "../src/inbox-signals/outlook-inbox-adapter.js";
import type { MailConnection } from "../src/inbox-signals/inbox-signal-types.js";

const outlook: MailConnection = {
  id: "outlook-1", provider: "outlook", accountEmail: "user@example.com",
  accessToken: async () => "graph-token",
};
const BASE = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta";

type Call = { url: string; authorization: string; prefer: string };

test("Outlook delta keeps every message on an already-fetched page larger than maxResults", async () => {
  const calls: Call[] = [];
  const stored = `${BASE}?$deltatoken=prev`;
  const delta = `${BASE}?$deltatoken=after-18`;
  const restore = mockFetch([
    { value: graphMessages("a", 18), "@odata.deltaLink": delta },
  ], calls);
  try {
    const page = await new OutlookInboxAdapter().fetch({
      connection: outlook, cursor: stored, maxResults: 10,
    });
    assert.equal(page.messages.length, 18);
    assert.deepEqual(
      page.messages.map((message) => message.sourceMessageId),
      Array.from({ length: 18 }, (_, index) => `a-${index}`),
    );
    assert.equal(page.cursor, delta);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, stored);
    assert.match(calls[0]?.prefer ?? "", /outlook\.body-content-type="text"/u);
    assert.match(calls[0]?.prefer ?? "", /odata\.maxpagesize=10/u);
  } finally { restore(); }
});

test("Outlook delta does not drop the overflow of a later page when @removed items shrank the first", async () => {
  const calls: Call[] = [];
  const next = `${BASE}?$skiptoken=page-2`;
  const delta = `${BASE}?$deltatoken=after-47`;
  const removed = Array.from({ length: 3 }, (_, index) => ({
    id: `gone-${index}`, "@removed": { reason: "deleted" },
  }));
  const restore = mockFetch([
    { value: [...removed, ...graphMessages("p1", 22)], "@odata.nextLink": next },
    { value: graphMessages("p2", 25), "@odata.deltaLink": delta },
  ], calls);
  try {
    const page = await new OutlookInboxAdapter().fetch({
      connection: outlook, cursor: null, maxResults: 25,
    });
    assert.equal(page.messages.length, 47);
    const ids = new Set(page.messages.map((message) => message.sourceMessageId));
    assert.equal(ids.size, 47);
    assert.ok(!ids.has("gone-0"));
    assert.ok(ids.has("p1-21") && ids.has("p2-0") && ids.has("p2-24"));
    assert.equal(page.cursor, delta);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.url, next);
  } finally { restore(); }
});

test("Outlook delta stops between pages and resumes from nextLink once maxResults is reached", async () => {
  const calls: Call[] = [];
  const next = `${BASE}?$skiptoken=page-2`;
  const restore = mockFetch([
    { value: graphMessages("full", 10), "@odata.nextLink": next },
    { value: graphMessages("never", 5), "@odata.deltaLink": `${BASE}?$deltatoken=never` },
  ], calls);
  try {
    const page = await new OutlookInboxAdapter().fetch({
      connection: outlook, cursor: null, maxResults: 10,
    });
    assert.equal(page.messages.length, 10);
    assert.equal(page.cursor, next);
    assert.equal(calls.length, 1);
    assert.ok(page.messages.every((message) => message.sourceMessageId.startsWith("full-")));
  } finally { restore(); }
});

function graphMessages(prefix: string, count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    internetMessageId: `<${prefix}-${index}@example.com>`,
    receivedDateTime: "2026-08-22T10:00:00Z",
    from: { emailAddress: { address: "jobs@example.com" } },
    subject: `Interview invitation ${prefix}-${index}`,
    body: { contentType: "text", content: "Please join the interview." },
    isDraft: false,
  }));
}

function mockFetch(bodies: unknown[], calls: Call[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      authorization: headers.get("Authorization") ?? "",
      prefer: headers.get("Prefer") ?? "",
    });
    const body = bodies.shift();
    if (body === undefined) return new Response("missing fixture", { status: 500 });
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}
