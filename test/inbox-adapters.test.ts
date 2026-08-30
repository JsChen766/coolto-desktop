import assert from "node:assert/strict";
import test from "node:test";

import { GmailInboxAdapter } from "../src/inbox-signals/gmail-inbox-adapter.js";
import { OutlookInboxAdapter } from "../src/inbox-signals/outlook-inbox-adapter.js";
import type { MailConnection } from "../src/inbox-signals/inbox-signal-types.js";

const gmail: MailConnection = {
  id: "gmail-1", provider: "gmail", accountEmail: "user@example.com",
  accessToken: async () => "gmail-token",
};
const outlook: MailConnection = {
  id: "outlook-1", provider: "outlook", accountEmail: "user@example.com",
  accessToken: async () => "graph-token",
};

test("Gmail adapter establishes history cursor and returns bounded message content", async () => {
  const calls: Array<{ url: string; authorization: string }> = [];
  const restore = mockFetch([
    { historyId: "100" },
    { messages: [{ id: "m-1" }] },
    {
      id: "m-1", internalDate: "1787432400000", payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "recruiter@example.com" },
          { name: "Subject", value: "Interview invitation" },
          { name: "Message-ID", value: "<m-1@example.com>" },
          { name: "Date", value: "Sat, 22 Aug 2026 10:00:00 +0000" },
        ],
        body: { data: Buffer.from("Please join the interview.").toString("base64url") },
      },
    },
  ], calls);
  try {
    const page = await new GmailInboxAdapter().fetch({
      connection: gmail, cursor: null, maxResults: 10,
    });
    assert.equal(page.cursor, "100");
    assert.equal(page.messages[0]?.bodyText, "Please join the interview.");
    assert.equal(page.messages[0]?.internetMessageId, "<m-1@example.com>");
    assert.ok(calls.every((call) => call.authorization === "Bearer gmail-token"));
    assert.ok(calls.every((call) => !call.url.includes("gmail-token")));
  } finally { restore(); }
});

test("Outlook adapter follows nextLink and persists only the provider deltaLink", async () => {
  const calls: Array<{ url: string; authorization: string }> = [];
  const next = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=next";
  const delta = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=done";
  const restore = mockFetch([
    { value: [{
      id: "g-1", internetMessageId: "<g-1@example.com>",
      receivedDateTime: "2026-08-22T10:00:00Z",
      from: { emailAddress: { address: "jobs@example.com" } },
      subject: "Application received",
      body: { contentType: "text", content: "We received your application." },
      isDraft: false,
    }], "@odata.nextLink": next },
    { value: [], "@odata.deltaLink": delta },
  ], calls);
  try {
    const page = await new OutlookInboxAdapter().fetch({
      connection: outlook, cursor: null, maxResults: 10,
    });
    assert.equal(page.cursor, delta);
    assert.equal(page.messages[0]?.subject, "Application received");
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.authorization === "Bearer graph-token"));
  } finally { restore(); }
});

test("Outlook adapter rejects a cross-origin opaque cursor before network", async () => {
  await assert.rejects(new OutlookInboxAdapter().fetch({
    connection: outlook, cursor: "https://evil.example/steal", maxResults: 10,
  }), /cursor origin\/path/u);
});

function mockFetch(
  bodies: unknown[],
  calls: Array<{ url: string; authorization: string }>,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      authorization: headers.get("Authorization") ?? "",
    });
    const body = bodies.shift();
    if (body === undefined) return new Response("missing fixture", { status: 500 });
    return new Response(JSON.stringify(body), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}
