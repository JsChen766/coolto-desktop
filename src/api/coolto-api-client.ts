import { CooltoApiTransport } from "./api-transport.js";
import { ExperienceApi } from "./experience-api.js";
import { JdWriterApi } from "./jd-writer-api.js";
import { ProfileJdApi } from "./profile-jd-api.js";
import { ResumePublicationApi } from "./resume-publication-api.js";
import { ResumeLibraryApi } from "./resume-library-api.js";
import { SyncApi } from "./sync-api.js";
import type { ResumePublicationGateway } from "../resume/save/types.js";
import type { AppConfigView,
  CurrentUser,
  CurrentUserReader,
  ExperienceCreateInput,
  ExperienceDetail,
  ExperienceReader,
  ExperienceRevisionPage,
  ExperienceRevisionReader,
  ExperienceSearchOptions,
  ExperienceSearchResult,
  ExperienceWriter,
  JdCreateInput,
  JdReader,
  JdRecord,
  JdSearchOptions,
  JdSearchResult,
  JdWriter,
  LoginCredentials,
  LoginUser,
  UserProfile,
  UserProfileReader,
  EmailChallengeAccepted,
  EmailChallengeInput,
  EmailLoginResult,
  EmailVerifyInput,
} from "./types.js";

export { CooltoApiError } from "./coolto-api-error.js";

export interface CooltoApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

/** Thin compatibility facade over resource-focused API adapters. */
export class CooltoApiClient
  implements
    CurrentUserReader,
    UserProfileReader,
    ExperienceReader,
    ExperienceRevisionReader,
    ExperienceWriter,
    JdReader,
    JdWriter
{
  readonly #transport: CooltoApiTransport;
  readonly #profileJd: ProfileJdApi;
  readonly #jdWriter: JdWriterApi;
  readonly #experiences: ExperienceApi;
  readonly #resumePublications: ResumePublicationApi;
  readonly #resumeLibrary: ResumeLibraryApi;
  readonly #sync: SyncApi;

  public constructor(options: CooltoApiClientOptions) {
    this.#transport = new CooltoApiTransport(
      options.baseUrl,
      options.fetchFn ?? globalThis.fetch,
    );
    this.#profileJd = new ProfileJdApi(this.#transport);
    this.#jdWriter = new JdWriterApi(this.#transport);
    this.#experiences = new ExperienceApi(this.#transport);
    this.#resumePublications = new ResumePublicationApi(this.#transport);
    this.#resumeLibrary = new ResumeLibraryApi(this.#transport);
    this.#sync = new SyncApi(this.#transport);
  }

  public get isAuthenticated(): boolean {
    return this.#transport.isAuthenticated;
  }

  public get resumes(): ResumePublicationGateway {
    return this.#resumePublications;
  }

  public get resumeLibrary(): ResumeLibraryApi {
    return this.#resumeLibrary;
  }

  public getAppConfig(signal?: AbortSignal): Promise<AppConfigView> {
    return this.#transport.getJson<AppConfigView>("/v1/app-config", signal);
  }

  public get sync(): SyncApi {
    return this.#sync;
  }

  public restoreSession(accessToken: string): void {
    this.#transport.restoreSession(accessToken);
  }

  public getSessionToken(): string {
    return this.#transport.getSessionToken();
  }

  public clearSession(): void {
    this.#transport.clearSession();
  }

  public login(credentials: LoginCredentials, signal?: AbortSignal): Promise<LoginUser> {
    return this.#transport.login(credentials, signal);
  }

  public requestEmailChallenge(
    input: EmailChallengeInput,
    signal?: AbortSignal,
  ): Promise<EmailChallengeAccepted> {
    return this.#transport.requestEmailChallenge(input, signal);
  }

  public verifyEmailChallenge(
    input: EmailVerifyInput,
    signal?: AbortSignal,
  ): Promise<EmailLoginResult> {
    return this.#transport.verifyEmailChallenge(input, signal);
  }

  public logout(signal?: AbortSignal): Promise<void> {
    return this.#transport.logout(signal);
  }

  public getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
    return this.#transport.request<CurrentUser>("/v1/users/me", {
      ...(signal ? { signal } : {}),
    });
  }

  public getUserProfile(signal?: AbortSignal): Promise<UserProfile> {
    return this.#profileJd.getUserProfile(signal);
  }

  public listJds(
    options: JdSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<JdSearchResult> {
    return this.#profileJd.listJds(options, signal);
  }

  public getJd(jdId: string, signal?: AbortSignal): Promise<JdRecord> {
    return this.#profileJd.getJd(jdId, signal);
  }

  public searchExperiences(
    options: ExperienceSearchOptions = {},
    signal?: AbortSignal,
  ): Promise<ExperienceSearchResult> {
    return this.#experiences.searchExperiences(options, signal);
  }

  public getExperience(
    experienceId: string,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    return this.#experiences.getExperience(experienceId, signal);
  }

  public listExperienceRevisions(
    experienceId: string,
    cursor?: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<ExperienceRevisionPage> {
    return this.#experiences.listExperienceRevisions(
      experienceId,
      cursor,
      limit,
      signal,
    );
  }

  public createExperience(
    input: ExperienceCreateInput,
    signal?: AbortSignal,
  ): Promise<ExperienceDetail> {
    return this.#experiences.createExperience(input, signal);
  }

  public createJd(
    input: JdCreateInput,
    signal?: AbortSignal,
  ): Promise<JdRecord> {
    return this.#jdWriter.createJd(input, signal);
  }
}
