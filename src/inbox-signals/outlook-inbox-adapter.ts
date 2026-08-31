import type {
  InboxIncrementalAdapter,
  InboxIncrementalPage,
  InboxMessagePayloadV1,
  MailConnection,
} from "./inbox-signal-types.js";
import { fetchMailJson, record, string } from "./mail-http.js";
import { boundedMailText, htmlToPlainText } from "./mail-text.js";

const ORIGIN = "https://graph.microsoft.com";

export class OutlookInboxAdapter implements InboxIncrementalAdapter {
  readonly provider = "outlook" as const;

  public async fetch(input: {
    connection: MailConnection; cursor: string | null; maxResults: number;
  }): Promise<InboxIncrementalPage> {
    const token = await input.connection.accessToken();
    let url = input.cursor
      ? validateCursor(input.cursor)
      : initialUrl(input.maxResults);
    const messages: InboxMessagePayloadV1[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
      const page = record(await fetchMailJson(url, token, {
        Prefer: 'outlook.body-content-type="text"',
      }), "Graph message delta");
      for (const item of Array.isArray(page.value) ? page.value : []) {
        const message = record(item, "Graph message");
        if (message["@removed"] || message.isDraft === true ||
            messages.length >= input.maxResults) continue;
        messages.push(toMessage(input.connection.id, message));
      }
      const next = page["@odata.nextLink"];
      if (typeof next === "string") {
        if (messages.length >= input.maxResults) {
          cursor = validateCursor(next);
          break;
        }
        url = validateCursor(next);
        if (pageNumber === 49) throw new Error("Graph delta 分页超过安全上限");
        continue;
      }
      cursor = typeof page["@odata.deltaLink"] === "string"
        ? validateCursor(page["@odata.deltaLink"] as string) : null;
      break;
    }
    if (!cursor) throw new Error("Graph delta 未返回可恢复 cursor");
    return { messages, cursor };
  }
}

function initialUrl(maxResults: number): string {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const query = new URLSearchParams({
    changeType: "created",
    "$select": "id,internetMessageId,receivedDateTime,from,subject,body,isDraft",
    "$filter": `receivedDateTime ge ${since}`,
    "$top": String(maxResults),
  });
  return `${ORIGIN}/v1.0/me/mailFolders/inbox/messages/delta?${query}`;
}

function validateCursor(value: string): string {
  const url = new URL(value);
  if (url.origin !== ORIGIN ||
      !url.pathname.startsWith("/v1.0/me/mailFolders/inbox/messages/delta")) {
    throw new Error("Graph delta cursor origin/path 无效");
  }
  return url.toString();
}

function toMessage(
  connectionId: string,
  value: Record<string, unknown>,
): InboxMessagePayloadV1 {
  const from = record(record(value.from, "Graph from").emailAddress, "Graph emailAddress");
  const body = record(value.body ?? {}, "Graph body");
  const content = typeof body.content === "string" ? body.content : "";
  const bodyText = body.contentType === "html"
    ? htmlToPlainText(content) : boundedMailText(content);
  return {
    version: 1, provider: "outlook", connectionId, direction: "received",
    sourceMessageId: string(value.id, "Graph message id"),
    internetMessageId: typeof value.internetMessageId === "string"
      ? value.internetMessageId : null,
    sender: typeof from.address === "string" ? from.address : "unknown",
    subject: typeof value.subject === "string" && value.subject
      ? value.subject : "(no subject)",
    receivedAt: new Date(string(value.receivedDateTime, "Graph receivedDateTime")).toISOString(),
    bodyText,
  };
}
