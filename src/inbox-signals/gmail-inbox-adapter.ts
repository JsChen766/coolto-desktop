import type {
  InboxIncrementalAdapter,
  InboxIncrementalPage,
  InboxMessagePayloadV1,
  MailConnection,
} from "./inbox-signal-types.js";
import { fetchMailJson, MailHttpError, record, string } from "./mail-http.js";
import { boundedMailText, htmlToPlainText } from "./mail-text.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailInboxAdapter implements InboxIncrementalAdapter {
  readonly provider = "gmail" as const;

  public async fetch(input: {
    connection: MailConnection; cursor: string | null; maxResults: number;
  }): Promise<InboxIncrementalPage> {
    const token = await input.connection.accessToken();
    if (!input.cursor) return this.#initial(input.connection.id, token, input.maxResults);
    try {
      return await this.#incremental(
        input.connection.id, token, input.cursor, input.maxResults,
      );
    } catch (error) {
      if (error instanceof MailHttpError && error.status === 404) {
        return this.#initial(input.connection.id, token, input.maxResults);
      }
      throw error;
    }
  }

  async #initial(
    connectionId: string,
    token: string,
    maxResults: number,
  ): Promise<InboxIncrementalPage> {
    const profile = record(await fetchMailJson(`${API}/profile`, token), "Gmail profile");
    const cursor = string(profile.historyId, "Gmail historyId");
    const query = new URLSearchParams({
      labelIds: "INBOX", q: "newer_than:30d", maxResults: String(maxResults),
    });
    const page = record(
      await fetchMailJson(`${API}/messages?${query.toString()}`, token),
      "Gmail messages.list",
    );
    const ids = readMessageIds(page.messages).slice(0, maxResults);
    return {
      messages: await Promise.all(ids.map((id) =>
        this.#message(connectionId, token, id))),
      cursor,
    };
  }

  async #incremental(
    connectionId: string,
    token: string,
    startHistoryId: string,
    maxResults: number,
  ): Promise<InboxIncrementalPage> {
    let pageToken: string | undefined;
    let cursor = startHistoryId;
    const ids = new Set<string>();
    let truncated = false;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const query = new URLSearchParams({
        startHistoryId, labelId: "INBOX", historyTypes: "messageAdded",
        maxResults: "500", ...(pageToken ? { pageToken } : {}),
      });
      const page = record(
        await fetchMailJson(`${API}/history?${query.toString()}`, token),
        "Gmail history.list",
      );
      cursor = typeof page.historyId === "string" ? page.historyId : cursor;
      for (const entry of Array.isArray(page.history) ? page.history : []) {
        const history = record(entry, "Gmail history");
        const entryIds: string[] = [];
        for (const added of Array.isArray(history.messagesAdded)
          ? history.messagesAdded : []) {
          const message = record(record(added, "Gmail messageAdded").message, "Gmail message");
          if (typeof message.id === "string") entryIds.push(message.id);
        }
        for (const id of entryIds) ids.add(id);
        if (typeof history.id === "string") cursor = history.id;
        if (ids.size >= maxResults) { truncated = true; break; }
      }
      if (truncated) break;
      pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
      if (!pageToken) break;
      if (pageNumber === 19) throw new Error("Gmail history 分页超过安全上限");
    }
    const selected = [...ids];
    return {
      messages: await Promise.all(selected.map((id) =>
        this.#message(connectionId, token, id))),
      cursor,
    };
  }

  async #message(
    connectionId: string,
    token: string,
    id: string,
  ): Promise<InboxMessagePayloadV1> {
    const query = new URLSearchParams({ format: "full" });
    const message = record(
      await fetchMailJson(`${API}/messages/${encodeURIComponent(id)}?${query}`, token),
      "Gmail messages.get",
    );
    const payload = record(message.payload, "Gmail payload");
    const headers = readHeaders(payload.headers);
    const received = Date.parse(headers.date ?? "");
    return {
      version: 1, provider: "gmail", connectionId, direction: "received",
      sourceMessageId: string(message.id, "Gmail message id"),
      internetMessageId: headers["message-id"] ?? null,
      sender: headers.from ?? "unknown",
      subject: headers.subject ?? "(no subject)",
      receivedAt: Number.isFinite(received)
        ? new Date(received).toISOString()
        : new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      bodyText: readBody(payload),
    };
  }
}

function readMessageIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const id = record(item, "Gmail message ref").id;
    return typeof id === "string" ? [id] : [];
  });
}

function readHeaders(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of Array.isArray(value) ? value : []) {
    const header = record(item, "Gmail header");
    if (typeof header.name === "string" && typeof header.value === "string") {
      result[header.name.toLowerCase()] = header.value;
    }
  }
  return result;
}

function readBody(part: Record<string, unknown>): string {
  const own = decodeBody(record(part.body ?? {}, "Gmail body"), part.mimeType);
  if (own) return own;
  const parts = Array.isArray(part.parts) ? part.parts.map((item) => record(item, "Gmail part")) : [];
  const plain = parts.find((item) => item.mimeType === "text/plain");
  if (plain) return readBody(plain);
  const html = parts.find((item) => item.mimeType === "text/html");
  if (html) return readBody(html);
  for (const child of parts) {
    const nested = readBody(child);
    if (nested) return nested;
  }
  return "";
}

function decodeBody(body: Record<string, unknown>, mimeType: unknown): string {
  if (typeof body.data !== "string") return "";
  const decoded = Buffer.from(
    body.data.replace(/-/gu, "+").replace(/_/gu, "/"), "base64",
  ).toString("utf8");
  return mimeType === "text/html" ? htmlToPlainText(decoded) : boundedMailText(decoded);
}
