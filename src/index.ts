export {
  createCooltoAgent,
  createDeepSeekDependencies,
  DEFAULT_MODEL_ID,
  DEFAULT_PROVIDER_ID,
  type AgentDependencies,
  type CreateAgentOptions,
} from "./agent/create-agent.js";
export {
  CooltoAgent,
  type CooltoAgentListener,
  type CooltoAgentOptions,
} from "./agent/coolto-agent.js";
export {
  type CooltoAgentEvent,
  mapPiEvent,
} from "./agent/events.js";
export {
  COOLTO_SYSTEM_PROMPT,
  SYSTEM_PROMPT_VERSION,
} from "./agent/system-prompt.js";
export {
  CooltoApiClient,
  CooltoApiError,
  type CooltoApiClientOptions,
} from "./api/coolto-api-client.js";
export type {
  CurrentUser,
  CurrentUserReader,
  ExperienceCategory,
  ExperienceDetail,
  ExperienceReader,
  ExperienceRevision,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  ExperienceSummary,
  LoginCredentials,
  LoginUser,
} from "./api/types.js";
export {
  KeychainSessionStore,
  type KeychainSessionStoreOptions,
} from "./auth/keychain-session-store.js";
export {
  ensureAuthenticated,
  type AuthenticatedUser,
} from "./auth/session-manager.js";
export type {
  AuthSessionStore,
  StoredAuthSession,
} from "./auth/session-store.js";
export {
  createToolRegistry,
  type ToolRegistryDependencies,
} from "./tools/registry.js";
