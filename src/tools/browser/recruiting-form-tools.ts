import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { BrowserAgentController, BrowserObservation } from "../../browser/agent-control-types.js";
import type { BrowserPageOperator, FormElementSummary } from "../../browser/types.js";
import { recruitingFormFixturePolicyForOrigin } from "../../browser/recruiting-form-fixture-policy.js";
import { normalizeRecruitingFrameSummary } from "../../browser/recruiting-page-recognition.js";
import { observeRecruitingPage } from "../../job-scout/recruiting-page-source.js";
import type { SelectedFileRegistry } from "../../files/selected-file-registry.js";
import { canonicalHash } from "../../agent-task/canonical-hash.js";
type FormFieldKind = "text" | "email" | "phone" | "date" | "select" | "checkbox" | "radio" | "file" | "sensitive" | "unknown";
export type RecruitingFormMode = "public_read_only" | "synthetic_review" | "takeover" | "unsupported";
export type RecruitingFormSurface = "listing" | "detail" | "form" | "auth" | "otp" | "captcha" | "legal" | "sensitive" | "submit" | "unknown";
export type RecruitingFormNextAction = "reobserve" | "user_takeover" | "field_review" | "upload_review" | "unsupported";
export interface RecruitingFormFieldView { id: string; name: string; label: string; kind: FormFieldKind; required: boolean; currentValuePresent: boolean; confidence: "high" | "medium" | "low"; writable: boolean; }
export interface RecruitingFormObservationView { mode: RecruitingFormMode; siteId: string; surface: RecruitingFormSurface; fields: RecruitingFormFieldView[]; nextAction: RecruitingFormNextAction; observationHash: string | null; tabId: string; origin: string | null; failure?: { code: string; nextStep: string }; }
export interface RecruitingFormToolDependencies { browser: BrowserAgentController; operator: BrowserPageOperator; selectedFiles?: SelectedFileRegistry; }
export type RecruitingFormToolResult = { content: { type: "text"; text: string }[]; details: unknown };
type FrameSummary = { sameOriginFrames?: number; crossOriginFrames?: number; openShadowRoots?: number };
type BrowserObservationWithFrames = BrowserObservation & { frameShadowSummary?: FrameSummary; frameProbeUnavailable?: boolean };
type AccessibilityValue = { role?: string; name?: string; value?: string; description?: string };
interface FrameProbe { available: boolean; summary?: FrameSummary; }
interface RefreshedForm { view: RecruitingFormObservationView; url: string | null; }
const noParameters = Type.Object({});
const fillParameters = Type.Object({ fillId: Type.String({ minLength: 1, maxLength: 200 }), value: Type.String({ maxLength: 20_000 }) });
const selectParameters = Type.Object({ fillId: Type.String({ minLength: 1, maxLength: 200 }), value: Type.String({ minLength: 1, maxLength: 500 }) });
const checkParameters = Type.Object({ fillId: Type.String({ minLength: 1, maxLength: 200 }), checked: Type.Boolean() });
const uploadParameters = Type.Object({ fillId: Type.String({ minLength: 1, maxLength: 200 }), fileId: Type.String({ minLength: 1, maxLength: 200 }) });
class RecruitingFormObservationSession {
  readonly #observations = new Map<string, RecruitingFormObservationView>();
  public constructor(private readonly deps: RecruitingFormToolDependencies) {}
  public async observe(): Promise<RecruitingFormToolResult> {
    const current = await this.#read(); const base = inspect(current);
    const tagged = base.mode === "synthetic_review" ? await taggedForObservation(this.deps.operator) : [];
    const view = inspect(current, tagged); this.#observations.set(current.tab.id, view);
    return result(view, current.tab.url);
  }
  public async fill(fillId: string, value: string): Promise<RecruitingFormToolResult> {
    const { current, view } = await this.#currentWrite(); const field = writableField(view, fillId);
    if (field.required && !value.trim()) throw new Error("required_field_blank：必填字段不能为空，请由用户接管处理");
    const target = await this.#target(field, fillId); await this.#assertStable(current, view);
    await this.deps.operator.fillField(target.fillId, value);
    const refreshed = await this.#refreshed(current.tab.id, view.origin); return result(refreshed.view, refreshed.url);
  }
  public async select(fillId: string, value: string): Promise<RecruitingFormToolResult> {
    const { current, view } = await this.#currentWrite(); const field = writableField(view, fillId);
    if (field.kind !== "select") throw new Error("unknown_field：目标不是原生合成表单下拉字段");
    const target = await this.#target(field, fillId); await this.#assertStable(current, view);
    await this.deps.operator.selectOption(target.fillId, value);
    const refreshed = await this.#refreshed(current.tab.id, view.origin); return result(refreshed.view, refreshed.url);
  }
  public async setChecked(fillId: string, checked: boolean): Promise<RecruitingFormToolResult> {
    const { current, view } = await this.#currentWrite(); const field = writableField(view, fillId);
    if (field.kind !== "checkbox" && field.kind !== "radio") throw new Error("unknown_field：目标不是合成表单勾选字段");
    const target = await this.#target(field, fillId); await this.#assertStable(current, view);
    await this.deps.operator.setChecked(target.fillId, checked);
    const refreshed = await this.#refreshed(current.tab.id, view.origin); return result(refreshed.view, refreshed.url);
  }
  public async upload(fillId: string, fileId: string): Promise<RecruitingFormToolResult> {
    const { current, view } = await this.#currentWrite(); const field = writableField(view, fillId);
    if (field.kind !== "file") throw new Error("unknown_field：目标不是合成表单文件字段");
    if (!this.deps.selectedFiles) throw new Error("file_reference_invalid：没有可用的宿主文件引用");
    const selected = await this.deps.selectedFiles.read(fileId).catch(() => { throw new Error("file_reference_invalid：宿主文件引用已失效，请重新选择文件"); });
    const directory = await mkdtemp(join(tmpdir(), "coolto-recruiting-form-"));
    try {
      const path = join(directory, basename(selected.metadata.filename) || "upload.bin");
      await writeFile(path, selected.content);
      const target = await this.#target(field, fillId); await this.#assertStable(current, view);
      const outcome = await this.deps.operator.uploadFile(target.fillId, [path]);
      if (outcome.cancelled) return result({ ...view, nextAction: "upload_review" }, current.tab.url, { fileId, cancelled: true });
      const refreshed = await this.#refreshed(current.tab.id, view.origin);
      return result(refreshed.view, refreshed.url, { fileId, filename: selected.metadata.filename, fileCount: outcome.fileCount });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  public async review(): Promise<RecruitingFormToolResult> {
    const { current, view } = await this.#currentWrite(); const log = this.deps.operator.getFillLog();
    if (!log.length) throw new Error("field_review_empty：当前没有可审核的字段写入");
    const tagged = await taggedForObservation(this.deps.operator);
    for (const field of view.fields.filter((item) => item.required)) {
      const element = tagged.find((item) => item.fillId === field.id);
      const record = log.find((item) => item.fillId === field.id);
      const group = field.kind === "radio" && field.name
        ? view.fields.filter((item) => item.kind === "radio" && item.name === field.name) : [field];
      const selected = field.kind === "radio" && group.some((member) =>
        tagged.some((item) => item.fillId === member.id && item.currentValue === "选中"));
      const satisfied = field.kind === "radio" ? selected : field.kind === "checkbox"
        ? element?.currentValue === "选中" : Boolean(record?.valueAfter.trim() || element?.currentValue?.trim());
      if (!satisfied) throw new Error("required_field_blank：必填字段仍为空，请接管页面完成后再审核");
    }
    await this.#assertStable(current, view); this.deps.operator.enterReview();
    return result({ ...view, nextAction: "field_review" }, current.tab.url, { review: "visible", fieldCount: log.length });
  }
  async #currentWrite(): Promise<{ current: BrowserObservationWithFrames; view: RecruitingFormObservationView }> {
    const current = await this.#read(); const base = inspect(current);
    const tagged = base.mode === "synthetic_review" ? await taggedForObservation(this.deps.operator) : [];
    const view = inspect(current, tagged); const saved = this.#observations.get(current.tab.id);
    if (!saved || !view.observationHash || saved.observationHash !== view.observationHash || saved.tabId !== current.tab.id || saved.origin !== view.origin) throw new Error("observation_stale：页面观察已变化，请重新观察后再继续");
    if (view.mode === "takeover") throw new Error("takeover_required：请接管页面完成敏感或跨域步骤后重新观察");
    if (view.mode !== "synthetic_review") throw new Error("public_read_only：仅本地合成表单允许写入");
    const access = this.deps.operator.checkWriteAccess(); if (!access.ok) throw new Error(access.message);
    return { current, view };
  }
  async #assertStable(expected: BrowserObservationWithFrames, view: RecruitingFormObservationView): Promise<void> {
    const current = await this.#read(); const base = inspect(current);
    const tagged = base.mode === "synthetic_review" ? await taggedForObservation(this.deps.operator) : [];
    const next = inspect(current, tagged);
    if (current.tab.id !== expected.tab.id || next.origin !== view.origin || next.observationHash !== view.observationHash) throw new Error("observation_stale：写入前页面已变化，请重新观察");
  }
  async #target(field: RecruitingFormFieldView, _fillId: string): Promise<FormElementSummary> { const elements = await taggedForObservation(this.deps.operator); const matches = elements.filter((item) => item.fillId === field.id); if (matches.length === 1) return matches[0]!; throw new Error("unknown_field：字段已变化或不存在，请重新观察"); }
  async #refreshed(tabId: string, origin: string | null): Promise<RefreshedForm> {
    const current = await this.#read(); const base = inspect(current);
    const tagged = base.mode === "synthetic_review" ? await taggedForObservation(this.deps.operator) : [];
    const view = inspect(current, tagged);
    if (current.tab.id !== tabId || view.origin !== origin) throw new Error("tab_or_origin_drift：写入后页面上下文已变化，请重新观察");
    this.#observations.set(tabId, view); return { view, url: current.tab.url };
  }
  async #read(): Promise<BrowserObservationWithFrames> {
    const observation = await this.deps.browser.snapshot(false); const probe = await frameSummaryFromOperator(this.deps.operator);
    if (!probe.available) return { ...observation, frameProbeUnavailable: true };
    return probe.summary ? { ...observation, frameShadowSummary: probe.summary } : observation;
  }
}
async function taggedForObservation(operator: BrowserPageOperator): Promise<readonly FormElementSummary[]> {
  try {
    if (!operator.checkWriteAccess().ok) return [];
    const tagged = await operator.tagElements(); const target: object = operator;
    const method = Reflect.get(target, "readLiveFieldValues");
    const live = typeof method === "function" ? await Reflect.apply(method, target, []) : [];
    const liveById = new Map((Array.isArray(live) ? live : [])
      .filter((item) => item && typeof item.fillId === "string" && typeof item.currentValue === "string")
      .map((item) => [item.fillId, { value: item.currentValue, hash: typeof item.valueHash === "string" ? item.valueHash : "", name: typeof item.name === "string" ? item.name : "" }] as const));
    return Promise.all(tagged.map(async (item) => {
      const liveValue = liveById.get(item.fillId);
      const withLive = liveValue ? { ...item, currentValue: liveValue.value, liveValueHash: liveValue.hash, liveName: liveValue.name } : item;
      if (item.inputType !== "checkbox" && item.inputType !== "radio") return withLive;
      const checked = await readCheckableState(operator, item.fillId);
      return checked === null ? withLive : { ...withLive, currentValue: checked ? "选中" : "未选中" };
    }));
  } catch { return []; }
}
async function readCheckableState(operator: BrowserPageOperator, fillId: string): Promise<boolean | null> {
  const target: object = operator; const method = Reflect.get(target, "readCheckableState");
  if (typeof method !== "function") return null;
  try { const value = await Reflect.apply(method, target, [fillId]); return typeof value === "boolean" ? value : null; }
  catch { return null; }
}
export function createRecruitingFormTools(dependencies: RecruitingFormToolDependencies): AgentTool[] {
  const session = new RecruitingFormObservationSession(dependencies);
  return [
    { name: "browser_recruiting_form_observe", label: "观察招聘合成表单", description: "读取宿主当前页面并识别招聘表单。公开站点保持只读，登录、OTP、CAPTCHA、法律、敏感问题和跨域 frame 必须用户接管。", parameters: noParameters, executionMode: "sequential", execute: async () => session.observe() },
    { name: "browser_recruiting_form_fill", label: "填写招聘表单字段", description: "仅在最新 observation 指向本地合成表单且已有宿主写权限时填写非敏感字段；页面变化、必填空值、未知字段和公开站点均 fail-closed。", parameters: fillParameters, executionMode: "sequential", execute: async (_id, params) => session.fill(readStringField(params, "fillId"), readStringField(params, "value", true)) },
    { name: "browser_recruiting_form_select", label: "选择招聘表单选项", description: "仅在本地合成表单中选择原生下拉选项；页面变化或公开站点会阻止操作。", parameters: selectParameters, executionMode: "sequential", execute: async (_id, params) => session.select(readStringField(params, "fillId"), readStringField(params, "value")) },
    { name: "browser_recruiting_form_set_checked", label: "勾选招聘表单字段", description: "仅在本地合成表单中勾选非敏感 checkbox/radio；页面变化或公开站点会阻止操作。", parameters: checkParameters, executionMode: "sequential", execute: async (_id, params) => session.setChecked(readStringField(params, "fillId"), readBooleanField(params, "checked")) },
    { name: "browser_recruiting_form_upload", label: "上传招聘表单文件", description: "使用用户明确选择的宿主 fileId 上传到本地合成表单；不接受路径，结果只返回 fileId 和文件元数据。", parameters: uploadParameters, executionMode: "sequential", execute: async (_id, params) => session.upload(readStringField(params, "fillId"), readStringField(params, "fileId")) },
    { name: "browser_recruiting_form_review", label: "审核招聘表单字段", description: "在本地合成表单写入完成后启动现有可见逐字段审核 Overlay；必填空值、页面变化和未授权状态会阻止审核。", parameters: noParameters, executionMode: "sequential", execute: async () => session.review() },
  ];
}
function inspect(observation: BrowserObservationWithFrames, tagged: readonly FormElementSummary[] = []): RecruitingFormObservationView {
  const origin = originFromUrl(observation.tab.url); const frameSummary = frameSummaryOf(observation);
  const source = observeRecruitingPage({ page: observation.page, origin, accessibility: observation.accessibility, ...(frameSummary ? { frameShadowSummary: frameSummary } : {}) });
  const surface = surfaceOf(source.recognition.surfaceKind); const fixture = recruitingFormFixturePolicyForOrigin(origin);
  const used = new Set<string>();
  const fields = observation.page.formFields.map((field, index) => fieldView(field, index, Boolean(fixture && surface === "form"), tagged, observation.accessibility, used));
  const highRisk = ["auth", "otp", "captcha", "legal", "sensitive", "submit"].includes(surface);
  const crossOrigin = (frameSummary?.crossOriginFrames ?? 0) > 0; const frameUnavailable = observation.frameProbeUnavailable === true || !frameSummary;
  const takeover = highRisk || crossOrigin || frameUnavailable; const unsupported = source.recognition.siteId === "unknown" || surface === "unknown";
  const mode: RecruitingFormMode = unsupported ? "unsupported" : takeover ? "takeover" : fixture && surface === "form" ? "synthetic_review" : "public_read_only";
  const nextAction: RecruitingFormNextAction = mode === "unsupported" ? "unsupported" : mode === "takeover" ? "user_takeover" : mode === "synthetic_review" ? "field_review" : surface === "form" ? "user_takeover" : "reobserve";
  const observationHash = source.recognition.observationHash ? canonicalHash({ base: source.recognition.observationHash, values: liveValues(observation, tagged, observation.accessibility) }) : null;
  return { mode, siteId: source.recognition.siteId, surface, fields, nextAction, observationHash, tabId: observation.tab.id, origin, ...(mode === "unsupported" ? { failure: { code: "unsupported_origin_or_page", nextStep: "请在首批本地合成表单中重新打开并观察" } } : takeover ? { failure: { code: frameUnavailable ? "frame_topology_unavailable" : crossOrigin ? "cross_origin_frame" : `${surface}_requires_takeover`, nextStep: "请接管页面完成敏感或跨域步骤，交还后重新观察" } } : {}) };
}
function fieldView(field: { label: string; name: string; inputType: string; required: boolean }, index: number, writable: boolean, tagged: readonly FormElementSummary[], accessibility: readonly AccessibilityValue[], used: Set<string>): RecruitingFormFieldView {
  const name = field.name.trim(); const label = field.label.trim(); const type = field.inputType.trim().toLowerCase();
  const matches = (item: FormElementSummary) => { const rawName = Reflect.get(item, "liveName"); const itemName = typeof rawName === "string" ? rawName.trim() : ""; const itemType = item.inputType?.trim().toLowerCase(); return Boolean(item.fillId) && !used.has(item.fillId) && (!name || !itemName || itemName === name) && (!type || itemType === type); };
  const target = tagged.find((item) => matches(item) && item.label.trim() === label) ?? tagged.find(matches);
  if (target) used.add(target.fillId);
  const id = target?.fillId || `field-${index + 1}`; const kind = fieldKind(field, target);
  return { id, name, label: field.label, kind, required: field.required, currentValuePresent: hasCurrentValue(field, target, accessibility), confidence: kind === "unknown" ? "low" : label || name ? "high" : "medium", writable: writable && Boolean(target) && kind !== "sensitive" && kind !== "unknown" };
}
function hasCurrentValue(field: { label: string; name: string; inputType: string }, target: FormElementSummary | undefined, accessibility: readonly AccessibilityValue[]): boolean {
  const type = field.inputType.trim().toLowerCase(); const direct = Reflect.get(field, "currentValue");
  if (type === "checkbox" || type === "radio") return target?.currentValue !== undefined ? target.currentValue === "选中" : direct === "选中";
  if (typeof direct === "string" && direct.trim()) return true;
  if (target?.currentValue !== undefined) return Boolean(target.currentValue.trim());
  const keys = [field.label, field.name].map((value) => value.trim().toLowerCase()).filter(Boolean);
  return accessibility.some((node) => typeof node.value === "string" && Boolean(node.value.trim()) && keys.some((key) => `${node.name ?? ""} ${node.description ?? ""}`.toLowerCase().includes(key)));
}
function liveValues(observation: BrowserObservationWithFrames, tagged: readonly FormElementSummary[], accessibility: readonly AccessibilityValue[]): Array<{ id: string; value: string }> {
  return [...observation.page.formFields.map((field, index) => { const value = Reflect.get(field, "currentValue"); return { id: field.name || field.label || `field-${index}`, value: typeof value === "string" ? value : "" }; }), ...tagged.map((field) => { const hash = Reflect.get(field, "liveValueHash"); return { id: field.fillId, value: typeof hash === "string" ? hash : field.currentValue ?? "" }; }), ...accessibility.map((node, index) => ({ id: `a11y:${node.name || node.role || index}`, value: node.value ?? "" }))].map((field) => ({ id: field.id, value: field.value }));
}
function fieldKind(field: { label: string; name: string; inputType: string }, tagged?: FormElementSummary): FormFieldKind {
  const type = field.inputType.trim().toLowerCase(); const role = tagged?.role?.trim().toLowerCase(); const signal = `${field.label} ${field.name} ${type}`.toLowerCase();
  if (role === "combobox" || role === "listbox" || type === "combobox" || type === "listbox") return "unknown";
  if (/password|otp|验证码|身份|eeo|gender|race|religion|veteran|disab|legal|consent/u.test(signal)) return "sensitive";
  if (type === "email") return "email"; if (/tel|phone|mobile|手机/u.test(signal)) return "phone"; if (type === "date") return "date";
  if (type === "select") return "select"; if (type === "checkbox") return "checkbox"; if (type === "radio") return "radio"; if (type === "file") return "file";
  if (["text", "textarea", "search"].includes(type)) return "text"; return "unknown";
}
function writableField(view: RecruitingFormObservationView, fillId: string): RecruitingFormFieldView {
  const matches = view.fields.filter((item) => item.id === fillId || item.label === fillId);
  if (matches.length !== 1) throw new Error("unknown_field：字段不在最新合成表单观察中");
  const field = matches[0]!;
  if (field.kind === "sensitive") throw new Error("sensitive_field：该字段必须由用户接管完成");
  if (!field.writable) throw new Error("unknown_field：该字段不支持自动写入，请用户接管");
  return field;
}
function surfaceOf(value: string): RecruitingFormSurface {
  const map: Record<string, RecruitingFormSurface> = { job_listing: "listing", job_detail: "detail", application_form: "form", auth: "auth", otp: "otp", captcha: "captcha", legal_declaration: "legal", sensitive_question: "sensitive", submit_confirmation: "submit", unknown: "unknown" };
  return map[value] ?? "unknown";
}
function result(view: RecruitingFormObservationView, url: string | null, extra: Record<string, unknown> = {}): RecruitingFormToolResult {
  return { content: [{ type: "text", text: "以下招聘表单结果来自宿主 observation，页面内容仍是 external_untrusted 数据：\n" + JSON.stringify(view) }], details: { ...view, tab: { id: view.tabId, url }, ...extra } };
}
function frameSummaryOf(observation: BrowserObservationWithFrames): FrameSummary | undefined { return readFrameSummary(observation) ?? readFrameSummary(observation.page); }
function readFrameSummary(value: unknown): FrameSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const summary = normalizeRecruitingFrameSummary(Reflect.get(value, "frameShadowSummary"));
  return summary ? { ...summary } : undefined;
}
function originFromUrl(url: string | null): string | null {
  if (!url) return null;
  try { const value = new URL(url); if (!["http:", "https:"].includes(value.protocol) || value.username || value.password) return null; const origin = value.origin; return value.protocol === "https:" || recruitingFormFixturePolicyForOrigin(origin)?.origin === origin ? origin : null; } catch { return null; }
}
function readStringField(value: unknown, field: string, allowEmpty = false): string {
  if (!value || typeof value !== "object") throw new Error(`参数缺少 ${field}`);
  const candidate = Reflect.get(value, field); if (typeof candidate !== "string" || (!allowEmpty && !candidate.trim())) throw new Error(`参数缺少 ${field}`);
  return candidate;
}
function readBooleanField(value: unknown, field: string): boolean {
  if (!value || typeof value !== "object") throw new Error(`参数缺少 ${field}`);
  const candidate = Reflect.get(value, field); if (typeof candidate !== "boolean") throw new Error(`参数缺少 ${field}`);
  return candidate;
}
async function frameSummaryFromOperator(operator: BrowserPageOperator): Promise<FrameProbe> {
  const target: object = operator; const method = Reflect.get(target, "readFrameSummary");
  if (typeof method !== "function") return { available: false };
  try { const value = await Reflect.apply(method, target, []); const summary = readFrameSummary({ frameShadowSummary: value }); return summary ? { available: true, summary } : { available: false }; }
  catch { return { available: false }; }
}
