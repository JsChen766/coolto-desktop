import { randomUUID } from "node:crypto";
import {
  mkdir, readFile, rm, writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { app, safeStorage } from "electron";
import { localScopeDigest, localScopeKey, requireScopedEnvelope } from "../../../privacy/local-scope.js";
import { uuidV7 } from "../../../agent-task/uuid-v7.js";
import type {
  ConnectedInboxProvider,
  MailConnection,
  MailConnectionRegistry,
} from "../../../inbox-signals/inbox-signal-types.js";
import type { MailConnectionView, MailProviderView } from "../../shared/types.js";
import { renameAgentFile } from "../agent-task/atomic-agent-file.js";
import { mailOAuthProvider, type MailOAuthProviderConfig } from "./mail-oauth-provider.js";
import {
  refreshOAuthToken,
  runOAuthLoopback,
  type OAuthTokenResponse,
} from "./oauth-loopback.js";

interface StoredConnection extends MailConnectionView { refreshToken: string }
interface CachedToken { value: string; expiresAt: number }
export interface MailConnectionOAuthDependencies {
  provider(value: ConnectedInboxProvider): MailOAuthProviderConfig | undefined;
  authorize(input: Parameters<typeof runOAuthLoopback>[0]): Promise<OAuthTokenResponse>;
  refresh(input: Parameters<typeof refreshOAuthToken>[0]): Promise<OAuthTokenResponse>;
}

const DEFAULT_OAUTH: MailConnectionOAuthDependencies = {
  provider: mailOAuthProvider, authorize: runOAuthLoopback, refresh: refreshOAuthToken,
};

export class ElectronMailConnectionService implements MailConnectionRegistry {
  readonly #directory: string;
  readonly #path: string;
  #connections: StoredConnection[] | undefined;
  readonly #tokens = new Map<string, CachedToken>();
  readonly #refreshes = new Map<string, Promise<string>>();
  public constructor(
    private readonly apiBaseUrl: string,
    private readonly ownerId: string,
    private readonly oauth: MailConnectionOAuthDependencies = DEFAULT_OAUTH,
  ) {
    this.#directory = join(app.getPath("userData"), "mail-connections", localScopeKey(apiBaseUrl, ownerId));
    this.#path = join(this.#directory, "connections.coolto");
  }

  public providers(): MailProviderView[] {
    return (["gmail", "outlook"] as const).map((provider) => ({
      provider,
      configured: Boolean(this.oauth.provider(provider)),
      requiredReadScope: provider === "gmail" ? "gmail.readonly" : "Mail.Read",
      sendPermissionRequested: false,
    }));
  }

  public async list(): Promise<MailConnectionView[]> {
    return (await this.#load()).map(toView);
  }

  public async connect(provider: ConnectedInboxProvider): Promise<MailConnectionView> {
    const config = this.oauth.provider(provider);
    if (!config) throw new Error(`${provider} OAuth Client ID 尚未配置`);
    const tokens = await this.oauth.authorize({
      authorizationEndpoint: config.authorizationEndpoint,
      tokenEndpoint: config.tokenEndpoint, clientId: config.clientId,
      scopes: config.scopes,
      ...(config.authorizationParameters
        ? { authorizationParameters: config.authorizationParameters } : {}),
    });
    const accountEmail = (await config.accountEmail(tokens.accessToken)).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/u.test(accountEmail)) throw new Error("邮箱 Provider 未返回有效账号");
    const connections = await this.#load();
    const existing = connections.find((value) =>
      value.provider === provider && value.accountEmail === accountEmail);
    const connection: StoredConnection = {
      id: existing?.id ?? uuidV7(), provider, accountEmail,
      scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : config.scopes,
      connectedAt: new Date().toISOString(), refreshToken: tokens.refreshToken,
    };
    await this.#save([
      ...connections.filter((value) => value.id !== connection.id), connection,
    ]);
    this.#tokens.set(connection.id, {
      value: tokens.accessToken,
      expiresAt: Date.now() + tokens.expiresIn * 1_000,
    });
    return toView(connection);
  }

  public async disconnect(connectionId: string): Promise<void> {
    const connections = await this.#load();
    if (!connections.some((value) => value.id === connectionId)) {
      throw new Error("邮箱连接不存在");
    }
    await this.#save(connections.filter((value) => value.id !== connectionId));
    this.#tokens.delete(connectionId);
  }

  public async get(connectionId: string): Promise<MailConnection> {
    const connection = (await this.#load()).find((value) => value.id === connectionId);
    if (!connection) throw new Error("邮箱连接不存在或不属于当前用户");
    return { ...toView(connection), accessToken: () => this.#accessToken(connection.id) };
  }

  public async clearAll(): Promise<void> {
    this.#connections = [];
    this.#tokens.clear();
    await rm(this.#directory, { recursive: true, force: true });
  }

  async #accessToken(connectionId: string): Promise<string> {
    const cached = this.#tokens.get(connectionId);
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.value;
    const existing = this.#refreshes.get(connectionId);
    if (existing) return existing;
    const refresh = this.#refresh(connectionId).finally(() => {
      this.#refreshes.delete(connectionId);
    });
    this.#refreshes.set(connectionId, refresh);
    return refresh;
  }

  async #refresh(connectionId: string): Promise<string> {
    const connections = await this.#load();
    const connection = connections.find((value) => value.id === connectionId);
    if (!connection) throw new Error("邮箱连接不存在");
    const config = this.oauth.provider(connection.provider);
    if (!config) throw new Error(`${connection.provider} OAuth Client ID 尚未配置`);
    const tokens = await this.oauth.refresh({
      tokenEndpoint: config.tokenEndpoint, clientId: config.clientId,
      refreshToken: connection.refreshToken, scopes: config.scopes,
    });
    if (tokens.refreshToken !== connection.refreshToken) {
      connection.refreshToken = tokens.refreshToken;
      await this.#save(connections);
    }
    this.#tokens.set(connectionId, {
      value: tokens.accessToken,
      expiresAt: Date.now() + tokens.expiresIn * 1_000,
    });
    return tokens.accessToken;
  }

  async #load(): Promise<StoredConnection[]> {
    if (this.#connections) return this.#connections;
    try {
      ensureEncryption();
      const parsed = JSON.parse(safeStorage.decryptString(await readFile(this.#path))) as unknown;
      const values = requireScopedEnvelope<StoredConnection[]>(
        parsed, this.apiBaseUrl, this.ownerId,
      );
      this.#connections = Array.isArray(values) && values.every(isConnection) ? values : [];
    } catch (error) {
      if (!isMissing(error)) throw error;
      this.#connections = [];
    }
    return this.#connections;
  }

  async #save(values: StoredConnection[]): Promise<void> {
    ensureEncryption();
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(temporary, safeStorage.encryptString(JSON.stringify({
      scopeDigest: localScopeDigest(this.apiBaseUrl, this.ownerId),
      ownerId: this.ownerId,
      value: values,
    })), { mode: 0o600 });
    await renameAgentFile(temporary, this.#path);
    this.#connections = structuredClone(values);
  }
}

function toView(value: StoredConnection): MailConnectionView {
  const { refreshToken: _secret, ...view } = structuredClone(value);
  return view;
}

function ensureEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，拒绝保存邮箱连接");
}

function isConnection(value: unknown): value is StoredConnection {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredConnection>;
  return typeof item.id === "string" && ["gmail", "outlook"].includes(item.provider ?? "") &&
    typeof item.accountEmail === "string" && typeof item.refreshToken === "string" &&
    Array.isArray(item.scopes) && typeof item.connectedAt === "string";
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: string }).code === "ENOENT");
}
