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
export { ApiContractError } from "./api/normalizers.js";
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
  JdReader,
  JdRecord,
  JdRequirement,
  JdSearchOptions,
  JdSearchResult,
  LoginCredentials,
  LoginUser,
  UserProfile,
  UserProfileReader,
} from "./api/types.js";
export {
  EvidenceLedger,
  EvidenceValidationError,
  type EvidenceValidationErrorCode,
} from "./resume/evidence-ledger.js";
export {
  ResumeSourceSnapshotBuilder,
  ResumeSourceSnapshotError,
  type ResumeSourceSnapshotErrorCode,
  type ResumeSourceSnapshotReaders,
} from "./resume/source-snapshot.js";
export type {
  BulletEvidenceBinding,
  EvidenceCandidate,
  EvidenceValidationIssue,
  ResumeSourceExperienceSnapshot,
  ResumeSourceJdSnapshot,
  ResumeSourceProfileSnapshot,
  ResumeSourceSnapshot,
  ResumeSourceSnapshotInput,
  SourceEvidenceExcerpt,
} from "./resume/source-types.js";
export {
  STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  type ResumeTemplateSnapshot,
} from "./resume/template-contract.js";
export { ResumeCandidatePatcher } from "./resume/workspace/candidate-patcher.js";
export {
  ResumeCandidatePreparer,
  type ResumeCandidatePreparerOptions,
} from "./resume/workspace/candidate-preparer.js";
export type { ResumeCompiler } from "./resume/workspace/compiler-port.js";
export {
  ResumeWorkspaceError,
  type ResumeWorkspaceErrorCode,
} from "./resume/workspace/errors.js";
export { ResumeWorkspaceStore } from "./resume/workspace/workspace-store.js";
export type {
  PatchResumeCandidateInput,
  PrepareResumeCandidateInput,
  ResumeBudgetDiagnostic,
  ResumeCandidateLanguage,
  ResumeCandidateSnapshot,
  ResumePatchOperation,
  ResumeWorkspace,
  ResumeWorkspaceStatus,
} from "./resume/workspace/types.js";
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
