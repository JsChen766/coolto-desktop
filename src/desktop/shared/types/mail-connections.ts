export interface MailConnectionView {
  id: string;
  provider: "gmail" | "outlook";
  accountEmail: string;
  scopes: string[];
  connectedAt: string;
}

export interface MailProviderView {
  provider: "gmail" | "outlook";
  configured: boolean;
  requiredReadScope: "gmail.readonly" | "Mail.Read";
  sendPermissionRequested: false;
}

export interface MailConnectionsDesktopApi {
  providers(): Promise<MailProviderView[]>;
  list(): Promise<MailConnectionView[]>;
  connect(provider: "gmail" | "outlook"): Promise<MailConnectionView>;
  disconnect(connectionId: string): Promise<void>;
}
