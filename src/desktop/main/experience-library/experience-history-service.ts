import type {
  ExperienceRevision,
  ExperienceRevisionPage,
  ExperienceRevisionReader,
} from "../../../api/types.js";
import type {
  ExperienceHistoryPage,
  ExperienceHistoryRequest,
} from "../../../experience/maintenance-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";
import { toExperienceDetail } from "./experience-sync-mapping.js";

const PAGE_SIZE = 10;

export class ExperienceHistoryService {
  readonly #loaded = new Map<string, ExperienceRevision>();
  #loadedExperienceId: string | undefined;

  public constructor(
    private readonly local: LocalSyncStore,
    private readonly remote: ExperienceRevisionReader,
  ) {}

  public async list(
    request: ExperienceHistoryRequest,
  ): Promise<ExperienceHistoryPage> {
    const entity = this.#requiredEntity(request.experienceId);
    if (!request.cursor || this.#loadedExperienceId !== request.experienceId) {
      this.#loaded.clear();
      this.#loadedExperienceId = request.experienceId;
    }
    const pending = request.cursor ? null : pendingRevision(entity);
    if (isUnsyncedCreate(entity)) {
      return {
        items: [], nextCursor: null, pendingRevision: pending, unavailable: false,
      };
    }
    let page: ExperienceRevisionPage;
    try {
      page = await this.remote.listExperienceRevisions(
        request.experienceId,
        request.cursor,
        PAGE_SIZE,
        AbortSignal.timeout(10_000),
      );
    } catch {
      return {
        items: [], nextCursor: request.cursor ?? null,
        pendingRevision: pending, unavailable: true,
      };
    }
    for (const revision of page.items) {
      this.#loaded.set(revision.id, structuredClone(revision));
    }
    return {
      ...page,
      pendingRevision: pending && !page.items.some((item) => sameRevision(item, pending))
        ? pending
        : null,
      unavailable: false,
    };
  }

  public loadedRevision(
    experienceId: string,
    revisionId: string,
  ): ExperienceRevision {
    if (this.#loadedExperienceId !== experienceId) {
      throw new Error("历史版本已失效，请重新打开版本记录");
    }
    const revision = this.#loaded.get(revisionId);
    if (!revision || revision.experienceId !== experienceId) {
      throw new Error("历史版本未加载或已经失效");
    }
    const current = toExperienceDetail(
      this.#requiredEntity(experienceId),
    ).currentRevision;
    if (current && sameRevision(current, revision)) {
      throw new Error("该版本正文已是当前内容");
    }
    return structuredClone(revision);
  }

  #requiredEntity(experienceId: string): LocalEntity {
    const entity = this.local.getEntity("experience", experienceId);
    if (!entity || entity.operation === "delete") {
      throw new Error(`经历 ${experienceId} 不存在`);
    }
    return entity;
  }
}

export function pendingRevision(entity: LocalEntity): ExperienceRevision | null {
  if (entity.syncStatus !== "pending") return null;
  const local = toExperienceDetail(entity).currentRevision;
  if (!local) return null;
  const server = revisionFromPayload(entity.lastServerPayload);
  if (server && sameRevision(local, server)) return null;
  if (!server && entity.entityVersion > 0) return null;
  return local;
}

function isUnsyncedCreate(entity: LocalEntity): boolean {
  return entity.entityVersion === 0 && entity.lastServerOperation !== "upsert";
}

function revisionFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ExperienceRevision | undefined {
  if (!payload?.currentRevision) return undefined;
  const baseline: LocalEntity = {
    entityType: "experience", entityId: "baseline", entityVersion: 1,
    localVersion: 1, syncStatus: "clean", operation: "upsert",
    changedAt: "", payload,
  };
  return toExperienceDetail(baseline).currentRevision;
}

function sameRevision(a: ExperienceRevision, b: ExperienceRevision): boolean {
  if (a.id === b.id) return true;
  if (a.revisionHash && b.revisionHash) return a.revisionHash === b.revisionHash;
  return a.content === b.content;
}
