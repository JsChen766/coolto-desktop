import type { ConnectedInboxProvider } from "../../../inbox-signals/inbox-signal-types.js";
import { fetchMailJson, record, string } from "../../../inbox-signals/mail-http.js";

export interface MailOAuthProviderConfig {
  provider: ConnectedInboxProvider;
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  authorizationParameters?: Record<string, string>;
  accountEmail(accessToken: string): Promise<string>;
}

export function mailOAuthProvider(
  provider: ConnectedInboxProvider,
): MailOAuthProviderConfig | undefined {
  if (provider === "gmail") {
    const clientId = process.env.COOLTO_GOOGLE_OAUTH_CLIENT_ID?.trim();
    if (!clientId) return undefined;
    return {
      provider, clientId,
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      authorizationParameters: { access_type: "offline", prompt: "consent" },
      accountEmail: async (token) => {
        const profile = record(await fetchMailJson(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile", token,
        ), "Gmail profile");
        return string(profile.emailAddress, "Gmail account email");
      },
    };
  }
  const clientId = process.env.COOLTO_MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  return {
    provider, clientId,
    authorizationEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read"],
    accountEmail: async (token) => {
      const profile = record(await fetchMailJson(
        "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", token,
      ), "Microsoft profile");
      const value = profile.mail ?? profile.userPrincipalName;
      return string(value, "Microsoft account email");
    },
  };
}
