import type { CurrentUser } from "../api/types.js";

export interface StoredAuthSession {
  version: 1;
  apiBaseUrl: string;
  accessToken: string;
  currentUser?: CurrentUser;
}

export interface AuthSessionStore {
  load(): Promise<StoredAuthSession | undefined>;
  save(session: StoredAuthSession): Promise<void>;
  clear(): Promise<void>;
}
