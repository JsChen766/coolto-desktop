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
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceReader,
  ExperienceRevision,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  ExperienceSummary,
  ExperienceWriter,
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
  ExperienceImportProposalStore,
} from "./import/proposal-store.js";
export type {
  ExperienceImportCandidate,
  ExperienceImportProposal,
  ProposedExperience,
} from "./import/types.js";
export {
  ApprovalManager,
  type ApprovalListener,
} from "./approvals/approval-manager.js";
export { ApprovalStore } from "./approvals/approval-store.js";
export {
  ActionExecutorRegistry,
  type ActionExecutionContext,
  type ActionExecutor,
} from "./approvals/executor-registry.js";
export type {
  ActionRisk,
  ApprovalDecision,
  ApprovalDraft,
  ApprovalEvent,
  ApprovalExecutionResult,
  ApprovalPreview,
  ApprovalRequest,
} from "./approvals/types.js";
export {
  SelectedFileRegistry,
} from "./files/selected-file-registry.js";
export type {
  SelectedFileContent,
  SelectedFileMetadata,
  SupportedImportFileType,
} from "./files/types.js";
export {
  createToolRegistry,
  type ToolRegistryDependencies,
} from "./tools/registry.js";
