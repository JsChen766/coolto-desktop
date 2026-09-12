import { createHash, randomUUID } from "node:crypto";
import {
  mkdir, readdir, rm, stat, writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { localScopeKey } from "../../../privacy/local-scope.js";

import type { AgentHarnessServices } from
  "../../../agent-task/agent-harness-services.js";
import type { BrowserPageOperator } from "../../../browser/types.js";
import { resumePdfFilename } from "../../../resume/export/filename.js";
import type { ResumePdfCompiler } from "../../../resume/export/types.js";
import type { ResumePublicationGateway } from "../../../resume/save/types.js";
import { renameAgentFile } from "./atomic-agent-file.js";

interface StagedResume {
  filename: string;
  path: string;
  sha256: string;
  bytes: number;
  pageCount: number;
}

export class ManagedResumeUploadService {
  readonly #pending = new Map<string, Promise<StagedResume>>();
  readonly #ownerDirectory: string;

  public constructor(
    root: string,
    apiBaseUrl: string,
    ownerKey: string,
    private readonly harness: AgentHarnessServices,
    private readonly resumes: ResumePublicationGateway,
    private readonly compiler: ResumePdfCompiler,
    private readonly browser: BrowserPageOperator,
  ) {
    this.#ownerDirectory = join(root, localScopeKey(apiBaseUrl, ownerKey));
  }

  public async upload(conversationId: string, fillId: string) {
    const task = await this.#runningTask(conversationId);
    const active = await this.harness.grants.getActive(task.id);
    const policy = active.grant?.assetPolicy;
    if (!active.grant || active.revocation ||
        active.grant.jobCriteria.loopKind !== "resume_job_apply" ||
        typeof policy?.resumeId !== "string" ||
        typeof policy.resumeTitle !== "string" ||
        typeof policy.resumeContentHash !== "string") {
      throw new Error("当前 DelegationGrant 没有冻结可上传的 Resume");
    }
    const staged = await this.#stage(task.id, {
      id: policy.resumeId,
      title: policy.resumeTitle,
      contentHash: policy.resumeContentHash,
    });
    const outcome = await this.browser.uploadFile(fillId, [staged.path]);
    return {
      uploaded: !outcome.cancelled,
      filename: staged.filename,
      sha256: staged.sha256,
      bytes: staged.bytes,
      pageCount: staged.pageCount,
    };
  }

  public async cleanupTask(taskId: string): Promise<void> {
    const path = this.#taskDirectory(taskId);
    this.#pending.delete(taskId);
    await rm(path, { recursive: true, force: true });
  }

  public async cleanupExpired(now = Date.now()): Promise<void> {
    const entries = await readdir(this.#ownerDirectory, { withFileTypes: true })
      .catch((error) => isMissing(error) ? [] : Promise.reject(error));
    for (const entry of entries) {
      if (!entry.isDirectory() || !safeTaskId(entry.name)) continue;
      const path = this.#taskDirectory(entry.name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > 24 * 60 * 60 * 1_000) {
        await this.cleanupTask(entry.name);
      }
    }
  }

  public async clearAll(): Promise<void> {
    this.#pending.clear();
    await rm(this.#ownerDirectory, { recursive: true, force: true });
  }

  async #stage(
    taskId: string,
    frozen: { id: string; title: string; contentHash: string },
  ): Promise<StagedResume> {
    const existing = this.#pending.get(taskId);
    if (existing) return existing;
    const operation = this.#compileAndWrite(taskId, frozen).catch((error) => {
      this.#pending.delete(taskId);
      throw error;
    });
    this.#pending.set(taskId, operation);
    return operation;
  }

  async #compileAndWrite(
    taskId: string,
    frozen: { id: string; title: string; contentHash: string },
  ): Promise<StagedResume> {
    const resume = await this.resumes.getResume(frozen.id);
    if (resume.status !== "active" || resume.qualityStatus !== "passed" ||
        resume.title !== frozen.title || resume.contentHash !== frozen.contentHash) {
      throw new Error("冻结的 Resume 已归档、未达标或版本已变化");
    }
    const compiled = await this.compiler.compileForPdf(resume.structured);
    if (!compiled.result.qualified || compiled.result.pageCount !== 1) {
      throw new Error("冻结的 Resume 当前不能生成合格单页 PDF");
    }
    const directory = this.#taskDirectory(taskId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = resumePdfFilename(resume.title);
    const path = join(directory, filename);
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    await writeFile(temporary, compiled.pdf, { mode: 0o600 });
    await renameAgentFile(temporary, path);
    return {
      filename, path, bytes: compiled.pdf.byteLength,
      sha256: createHash("sha256").update(compiled.pdf).digest("hex"),
      pageCount: compiled.result.pageCount,
    };
  }

  async #runningTask(conversationId: string) {
    const task = await this.harness.tasks.findRunningByConversation(conversationId);
    if (!task) throw new Error("托管简历上传需要 running AgentTask");
    return task;
  }

  #taskDirectory(taskId: string): string {
    if (!safeTaskId(taskId)) throw new Error("AgentTask ID 无效");
    const path = resolve(this.#ownerDirectory, taskId);
    if (dirname(path) !== resolve(this.#ownerDirectory)) {
      throw new Error("AgentTask 上传目录越界");
    }
    return path;
  }
}

function safeTaskId(value: string): boolean {
  return /^[0-9a-z-]{1,200}$/iu.test(value);
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: string }).code === "ENOENT");
}
