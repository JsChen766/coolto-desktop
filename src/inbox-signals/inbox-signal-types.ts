export type ConnectedInboxProvider = "gmail" | "outlook";
export type InboxProvider = "browser_webmail" | ConnectedInboxProvider;

export type ExternalSignalKind =
  | "application_confirmation" | "screening" | "interview_invite"
  | "interview_change" | "offer" | "rejection" | "other";

export interface InboxMessagePayloadV1 {
  version: 1;
  provider: InboxProvider;
  connectionId: string;
  sourceMessageId: string;
  internetMessageId: string | null;
  sender: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
  securityFlags?: string[];
}

export interface InboxCursorV1 {
  version: 1;
  ownerId: string;
  taskId: string;
  provider: InboxProvider;
  connectionId: string;
  cursor: string;
  updatedAt: string;
}

export interface ExternalSignalV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  eventId: string;
  provider: InboxProvider;
  connectionId: string;
  sourceMessageId: string;
  sourceMessageHash: string;
  sender: string;
  subject: string;
  receivedAt: string;
  kind: ExternalSignalKind;
  confidence: number;
  applicationId: string | null;
  rationale: string;
  evidenceQuotes: string[];
  securityFlags: string[];
  status: "classified" | "proposed" | "applied" | "ignored";
  contentHash: string;
  createdAt: string;
}

export interface MailConnection {
  id: string;
  provider: ConnectedInboxProvider;
  accountEmail: string;
  accessToken(): Promise<string>;
}

export interface MailConnectionRegistry {
  get(connectionId: string): Promise<MailConnection>;
}

export interface InboxIncrementalPage {
  messages: InboxMessagePayloadV1[];
  cursor: string;
}

export interface InboxIncrementalAdapter {
  readonly provider: ConnectedInboxProvider;
  fetch(input: {
    connection: MailConnection;
    cursor: string | null;
    maxResults: number;
  }): Promise<InboxIncrementalPage>;
}
