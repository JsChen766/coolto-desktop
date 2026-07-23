export interface StoredAuthSession {
  version: 1;
  apiBaseUrl: string;
  accessToken: string;
}

export interface AuthSessionStore {
  load(): Promise<StoredAuthSession | undefined>;
  save(session: StoredAuthSession): Promise<void>;
  clear(): Promise<void>;
}
