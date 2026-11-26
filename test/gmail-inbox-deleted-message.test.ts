import assert from "node:assert/strict";
import test from "node:test";

import { GmailInboxAdapter } from "../src/inbox-signals/gmail-inbox-adapter.js";
import type { MailConnection } from "../src/inbox-signals/inbox-signal-types.js";
import { MailHttpError } from "../src/inbox-signals/mail-http.js";

const API_PATH = "/gmail/v1/users/me";
const gmail: MailConnection = {
  id: "gmail-1", provider: "gmail", accountEmail: "user@example.com",
  accessToken: async () => "gmail-token",
};

type Reply = { status: number; body: unknown };
type Route = (path: string, url: URL) => Reply | undefined;

test("Gmail incremental sync drops a permanently deleted message instead of resetting", async () => {
  const calls: string[] = [];
  const restore = mockFetch((path) => {
    if (path === "/history") return ok(historyPage(["m-1", "m-2", "m-3"], "60"));
    if (path === "/messages/m-2") return { status: 404, body: { error: "Not Found" } };
    if (path.startsWith("/messages/")) return ok(messageFixture(path.slice(10)));
    return undefined;
  }, calls);
  try {
    const page = await new GmailInboxAdapter().fetch({
      connection: gmail, cursor: "50", maxResults: 25,
    });
    assert.deepEqual(page.messages.map((message) => message.sourceMessageId), ["m-1", "m-3"]);
    assert.equal(page.cursor, "53");
    assert.ok(!calls.includes("/profile"), "must not fall back to the initial sync");
    assert.ok(!calls.includes("/messages"), "must not re-list the inbox");
  } finally { restore(); }
});

test("Gmail incremental sync keeps the truncated backlog cursor past a deleted message", async () => {
  const calls: string[] = [];
  const restore = mockFetch((path) => {
    if (path === "/history") return ok(historyPage(["m-1", "m-2", "m-3", "m-4"], "60"));
    if (path === "/messages/m-2") return { status: 404, body: { error: "Not Found" } };
    if (path.startsWith("/messages/")) return ok(messageFixture(path.slice(10)));
    return undefined;
  }, calls);
  try {
    const page = await new GmailInboxAdapter().fetch({
      connection: gmail, cursor: "50", maxResults: 3,
    });
    assert.deepEqual(page.messages.map((message) => message.sourceMessageId), ["m-1", "m-3"]);
    assert.equal(page.cursor, "53", "next poll must resume after m-3, not skip m-4");
    assert.ok(!calls.includes("/messages/m-4"));
    assert.ok(!calls.includes("/profile"));
  } finally { restore(); }
});

test("Gmail incremental sync still recovers from an expired startHistoryId", async () => {
  const calls: string[] = [];
  const restore = mockFetch((path) => {
    if (path === "/history") return { status: 404, body: { error: "Requested entity was not found." } };
    if (path === "/profile") return ok({ historyId: "200" });
    if (path === "/messages") return ok({ messages: [{ id: "m-8" }, { id: "m-9" }] });
    if (path === "/messages/m-8") return { status: 404, body: { error: "Not Found" } };
    if (path.startsWith("/messages/")) return ok(messageFixture(path.slice(10)));
    return undefined;
  }, calls);
  try {
    const page = await new GmailInboxAdapter().fetch({
      connection: gmail, cursor: "50", maxResults: 25,
    });
    assert.equal(page.cursor, "200");
    assert.deepEqual(page.messages.map((message) => message.sourceMessageId), ["m-9"]);
    assert.ok(calls.includes("/profile"));
    assert.ok(calls.includes("/messages"));
  } finally { restore(); }
});

test("Gmail incremental sync surfaces non-404 message errors", async () => {
  const calls: string[] = [];
  const restore = mockFetch((path) => {
    if (path === "/history") return ok(historyPage(["m-1", "m-2"], "60"));
    if (path === "/messages/m-2") return { status: 500, body: { error: "Backend Error" } };
    if (path.startsWith("/messages/")) return ok(messageFixture(path.slice(10)));
    return undefined;
  }, calls);
  try {
    await assert.rejects(
      new GmailInboxAdapter().fetch({ connection: gmail, cursor: "50", maxResults: 25 }),
      (error: unknown) => error instanceof MailHttpError && error.status === 500,
    );
    assert.ok(!calls.includes("/profile"));
  } finally { restore(); }
});

function ok(body: unknown): Reply {
  return { status: 200, body };
}

function historyPage(ids: string[], historyId: string): Record<string, unknown> {
  return {
    historyId,
    history: ids.map((id, index) => ({
      id: String(51 + index),
      messagesAdded: [{ message: { id, labelIds: ["INBOX"] } }],
    })),
  };
}

function messageFixture(id: string): Record<string, unknown> {
  return {
    id, internalDate: "1787432400000", payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "recruiter@example.com" },
        { name: "Subject", value: `Update ${id}` },
        { name: "Date", value: "Sat, 22 Aug 2026 10:00:00 +0000" },
      ],
      body: { data: Buffer.from(`Body of ${id}`).toString("base64url") },
    },
  };
}

function mockFetch(route: Route, calls: string[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname.startsWith(API_PATH)
      ? decodeURIComponent(url.pathname.slice(API_PATH.length))
      : url.pathname;
    calls.push(path);
    const reply = route(path, url) ?? { status: 599, body: { error: `unrouted ${path}` } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}
