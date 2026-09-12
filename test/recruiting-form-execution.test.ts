import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import type { BrowserPageOperator } from "../src/browser/types.js";
import type { SelectedFileRegistry } from "../src/files/selected-file-registry.js";
import { createRecruitingFormTools } from "../src/tools/browser/recruiting-form-tools.js";
const syntheticOrigin = "https://boss-zhipin.test";
type FormField = { label: string; name: string; inputType: string; placeholder: string; required: boolean; currentValue?: string };
type AccessibilityNode = { role?: string; name?: string; value?: string; description?: string };
type MutableFixture = { page: { url: string; title: string; text: string; formFields: FormField[] }; tab: { id: string; title: string; url: string; isActive: true; isLoading: false; canGoBack: false; canGoForward: false }; accessibility?: AccessibilityNode[] };
type FrameSummary = { sameOriginFrames?: number; crossOriginFrames?: number; openShadowRoots?: number };
type FrameProbeInput = FrameSummary | "throw";
type FormDetails = { mode: string; nextAction?: string; firstWritable?: boolean; firstValuePresent?: boolean; failureCode?: string };
function fixture(origin = syntheticOrigin): MutableFixture {
  const url = `${origin}/jobs/backend-engineer/apply`;
  return { tab: { id: "tab-1", title: "Apply", url, isActive: true, isLoading: false, canGoBack: false, canGoForward: false }, page: { url, title: "Apply for Backend Engineer", text: "Application form", formFields: [
    { label: "Full name", name: "fullName", inputType: "text", placeholder: "", required: true, currentValue: "Existing name" },
    { label: "Country", name: "country", inputType: "select", placeholder: "", required: false },
    { label: "Subscribe updates", name: "updates", inputType: "checkbox", placeholder: "", required: false },
  ] } };
}
function harness(value = fixture(), frameSummary?: FrameProbeInput, selectedFiles?: SelectedFileRegistry, checkedValue?: "选中" | "未选中", actualChecked?: boolean | null, checkedStates: Record<string, boolean> = {}) {
  const calls: string[] = []; const uploaded: string[] = [];
  const browserShape = { getActiveTab: () => value.tab, snapshot: async () => ({ tab: value.tab, page: value.page, accessibility: (value.accessibility ?? []).map((node) => ({ ...node, value: node.value ?? "", description: node.description ?? "", disabled: false })), accessibilityTruncated: false }) };
  const browser = browserShape as unknown as BrowserAgentController;
  const operatorShape = {
    isWriteAccessGranted: () => true, checkWriteAccess: () => ({ ok: true }), readFrameSummary: async () => {
      if (frameSummary === "throw") throw new Error("frame probe unavailable");
      return frameSummary ?? { sameOriginFrames: 0, crossOriginFrames: 0, openShadowRoots: 0 };
    },
    tagElements: async () => value.page.formFields.map((field, index) => ({ fillId: field.inputType === "radio" ? `radio-${index + 1}` : field.name, elementType: field.inputType === "select" ? "select" : "input", inputType: field.inputType, label: field.label, placeholder: field.placeholder, required: field.required, currentValue: field.currentValue ?? "" })),
    fillField: async (fillId: string) => { calls.push(`fill:${fillId}`); },
    selectOption: async (fillId: string) => { calls.push(`select:${fillId}`); },
    setChecked: async (fillId: string) => { calls.push(`checked:${fillId}`); },
    readCheckableState: async (fillId: string) => checkedStates[fillId] ?? actualChecked ?? null,
    uploadFile: async (fillId: string) => { uploaded.push(fillId); calls.push(`upload:${fillId}`); return { cancelled: false, filenames: ["resume.pdf"], fileCount: 1 }; }, isReviewing: () => false,
    getFillLog: () => [{ fillId: "fullName", label: "Full name", elementType: "input", valueBefore: "", valueAfter: "Ada", writtenAt: new Date().toISOString() }, ...(checkedValue ? [{ fillId: "updates", label: "Subscribe updates", elementType: "checkbox" as const, valueBefore: "", valueAfter: checkedValue, writtenAt: new Date().toISOString() }] : []), ...uploaded.map((fillId) => ({ fillId, label: "文件附件", elementType: "input" as const, valueBefore: "", valueAfter: "resume.pdf", writtenAt: new Date().toISOString() }))],
    enterReview: () => { calls.push("review"); },
  };
  const operator = operatorShape as unknown as BrowserPageOperator;
  const tools = createRecruitingFormTools(selectedFiles ? { browser, operator, selectedFiles } : { browser, operator });
  const get = (name: string): AgentTool => { const tool = tools.find((item) => item.name === name); if (!tool) throw new Error(`Missing tool ${name}`); return tool; };
  return { value, calls, get };
}
async function execute(tool: AgentTool, params: Record<string, unknown>) {
  if (!tool.execute) throw new Error(`Missing tool executor: ${tool.name}`);
  return tool.execute("test-call", params as never);
}
function detailsOf(value: { details: unknown }): FormDetails {
  if (!value.details || typeof value.details !== "object") throw new Error("missing details");
  const mode = Reflect.get(value.details, "mode"); if (typeof mode !== "string") throw new Error("missing mode");
  const nextAction = Reflect.get(value.details, "nextAction"); const fields = Reflect.get(value.details, "fields");
  const first = Array.isArray(fields) && fields[0] && typeof fields[0] === "object" ? Reflect.get(fields[0], "writable") : undefined;
  const firstPresent = Array.isArray(fields) && fields[0] && typeof fields[0] === "object" ? Reflect.get(fields[0], "currentValuePresent") : undefined;
  const failure = Reflect.get(value.details, "failure"); const failureCode = failure && typeof failure === "object" ? Reflect.get(failure, "code") : undefined;
  return { mode, ...(typeof nextAction === "string" ? { nextAction } : {}), ...(typeof first === "boolean" ? { firstWritable: first } : {}), ...(typeof firstPresent === "boolean" ? { firstValuePresent: firstPresent } : {}), ...(typeof failureCode === "string" ? { failureCode } : {}) };
}
function fieldViewsOf(value: { details: unknown }): Array<{ id: string; name: string }> {
  if (!value.details || typeof value.details !== "object") throw new Error("missing details");
  const fields = Reflect.get(value.details, "fields");
  if (!Array.isArray(fields)) throw new Error("missing fields");
  return fields.map((field) => {
    if (!field || typeof field !== "object") throw new Error("invalid field");
    const id = Reflect.get(field, "id"); const name = Reflect.get(field, "name");
    if (typeof id !== "string" || typeof name !== "string") throw new Error("invalid field identity");
    return { id, name };
  });
}

test("synthetic form observes fields, supports select/check/review, and rejects stale page", async () => {
  const value = harness(); const observed = await execute(value.get("browser_recruiting_form_observe"), {});
  assert.equal(detailsOf(observed).mode, "synthetic_review"); assert.equal(detailsOf(observed).firstWritable, true); assert.equal(detailsOf(observed).firstValuePresent, true);
  await execute(value.get("browser_recruiting_form_select"), { fillId: "country", value: "Hong Kong" }); await execute(value.get("browser_recruiting_form_set_checked"), { fillId: "updates", checked: true }); await execute(value.get("browser_recruiting_form_review"), {});
  assert.deepEqual(value.calls, ["select:country", "checked:updates", "review"]);
  const stale = harness(); await execute(stale.get("browser_recruiting_form_observe"), {}); stale.value.page.title = "Rerendered application";
  await assert.rejects(execute(stale.get("browser_recruiting_form_fill"), { fillId: "fullName", value: "Ada" }), /observation|页面/u); assert.deepEqual(stale.calls, []);
});
test("same-origin iframe topology remains eligible for synthetic review", async () => {
  const value = harness(fixture(), { sameOriginFrames: 1, crossOriginFrames: 0 }); assert.equal(detailsOf(await execute(value.get("browser_recruiting_form_observe"), {})).mode, "synthetic_review");
});
test("custom select falls back to a manual field instead of generic writing", async () => {
  const value = harness(); value.value.page.formFields[1] = { label: "Country", name: "country", inputType: "combobox", placeholder: "", required: false }; await execute(value.get("browser_recruiting_form_observe"), {});
  await assert.rejects(execute(value.get("browser_recruiting_form_select"), { fillId: "country", value: "Hong Kong" }), /unknown_field|接管/u); assert.deepEqual(value.calls, []);
});
test("unavailable or cross-origin frame topology forces visible takeover", async () => {
  for (const probe of ["throw", { sameOriginFrames: 0, crossOriginFrames: 1 }] as const) {
    const value = harness(fixture(), probe); const details = detailsOf(await execute(value.get("browser_recruiting_form_observe"), {})); assert.equal(details.mode, "takeover"); assert.equal(details.nextAction, "user_takeover");
    await assert.rejects(execute(value.get("browser_recruiting_form_fill"), { fillId: "fullName", value: "Ada" }), /takeover/u); assert.deepEqual(value.calls, []);
  }
});
test("public forms and sensitive or body-risk fields fail closed", async () => {
  const publicForm = harness(fixture("https://www.zhipin.com")); assert.equal(detailsOf(await execute(publicForm.get("browser_recruiting_form_observe"), {})).mode, "public_read_only");
  await assert.rejects(execute(publicForm.get("browser_recruiting_form_fill"), { fillId: "fullName", value: "Ada" }), /只读|read|synthetic/u);
  for (const text of ["What is your gender?", "I agree to the terms", "I agree\n to the terms of use", "Do you identify as a veteran?", "Please complete the CAPTCHA before continuing", "Enter your one-time code"]) {
    const value = harness(); value.value.page.text = text; value.value.accessibility = [{ role: "staticText", name: text, value: "", description: "" }];
    assert.equal(detailsOf(await execute(value.get("browser_recruiting_form_observe"), {})).mode, "takeover", text);
    await assert.rejects(execute(value.get("browser_recruiting_form_fill"), { fillId: "fullName", value: "Ada" }), /takeover/u);
  }
  const sensitive = harness(); sensitive.value.page.formFields[0] = { label: "One-time password", name: "otp", inputType: "text", placeholder: "", required: true }; await execute(sensitive.get("browser_recruiting_form_observe"), {});
  await assert.rejects(execute(sensitive.get("browser_recruiting_form_fill"), { fillId: "otp", value: "123456" }), /takeover|敏感|otp/u);
});
test("required blank and unchecked fields block review", async () => {
  const blank = harness(); blank.value.page.formFields.push({ label: "Email", name: "email", inputType: "email", placeholder: "", required: true }); await execute(blank.get("browser_recruiting_form_observe"), {}); await assert.rejects(execute(blank.get("browser_recruiting_form_review"), {}), /required_field_blank/u);
  const uncheckedFixture = fixture(); uncheckedFixture.page.formFields[2]!.required = true; const unchecked = harness(uncheckedFixture, undefined, undefined, "未选中"); await execute(unchecked.get("browser_recruiting_form_observe"), {}); await assert.rejects(execute(unchecked.get("browser_recruiting_form_review"), {}), /required_field_blank/u);
});
test("host file references upload and remain reviewable without a path", async () => {
  const value = fixture(); value.page.formFields.push({ label: "Resume", name: "resume", inputType: "file", placeholder: "", required: false });
  const selectedFiles = { read: async (fileId: string) => { if (fileId !== "file-1") throw new Error("missing file"); return { metadata: { id: fileId, filename: "resume.pdf", type: "pdf", sizeBytes: 3 }, content: Buffer.from("pdf") }; } } as unknown as SelectedFileRegistry;
  const upload = harness(value, undefined, selectedFiles); await execute(upload.get("browser_recruiting_form_observe"), {}); const result = await execute(upload.get("browser_recruiting_form_upload"), { fillId: "resume", fileId: "file-1" });
  const details = JSON.stringify(result.details); assert.equal(details.includes("coolto-recruiting-form-"), false); assert.equal(details.includes("\"fileId\":\"file-1\""), true); await execute(upload.get("browser_recruiting_form_review"), {}); assert.deepEqual(upload.calls, ["upload:resume", "review"]);
  await assert.rejects(execute(upload.get("browser_recruiting_form_upload"), { fillId: "resume", fileId: "expired" }), /file_reference_invalid/u);
});
test("malformed, non-finite, negative, or empty topology forces takeover", async () => {
  for (const probe of [
    {}, { sameOriginFrames: 0, crossOriginFrames: Number.NaN },
    { sameOriginFrames: -1, crossOriginFrames: 0 },
    { sameOriginFrames: 0, crossOriginFrames: 0, openShadowRoots: -1 },
  ] as const) {
    const value = harness(fixture(), probe);
    const details = detailsOf(await execute(value.get("browser_recruiting_form_observe"), {}));
    assert.equal(details.mode, "takeover");
    assert.equal(details.failureCode, "frame_topology_unavailable");
  }
});

test("live values stale writes and unrelated body text stays eligible", async () => {
  const stale = harness();
  await execute(stale.get("browser_recruiting_form_observe"), {});
  stale.value.page.formFields[0]!.currentValue = "Changed after observation";
  await assert.rejects(
    execute(stale.get("browser_recruiting_form_fill"), { fillId: "fullName", value: "Ada" }),
    /observation|页面/u,
  );
  const benign = harness();
  benign.value.page.text = "This role supports gender equality. See the privacy policy.";
  assert.equal(detailsOf(await execute(benign.get("browser_recruiting_form_observe"), {})).mode, "synthetic_review");
});
test("body risk ignores chrome regions but blocks risky main content", async () => {
  const footer = harness();
  footer.value.page.text = "By using this site, I agree to the terms and privacy policy.";
  footer.value.accessibility = [{ role: "contentinfo", name: "", value: "", description: "" }, { role: "staticText", name: footer.value.page.text, value: "", description: "" }];
  assert.equal(detailsOf(await execute(footer.get("browser_recruiting_form_observe"), {})).mode, "synthetic_review");
  const navigation = harness();
  navigation.value.page.text = "checking your browser";
  navigation.value.accessibility = [{ role: "navigation", name: "", value: "", description: "" }, { role: "staticText", name: "checking your browser", value: "", description: "" }];
  assert.equal(detailsOf(await execute(navigation.get("browser_recruiting_form_observe"), {})).mode, "synthetic_review");
  const main = harness();
  main.value.page.text = "safe form";
  main.value.accessibility = [{ role: "staticText", name: "Please complete the CAPTCHA before continuing", value: "", description: "" }];
  assert.equal(detailsOf(await execute(main.get("browser_recruiting_form_observe"), {})).mode, "takeover");
});

test("radio options keep unique ids and required review uses exact groups", async () => {
  const value = fixture();
  value.page.formFields = [
    { label: "Yes", name: "workAuth", inputType: "radio", placeholder: "", required: true },
    { label: "Yes", name: "workAuth", inputType: "radio", placeholder: "", required: true },
    { label: "Yes", name: "otherAuth", inputType: "radio", placeholder: "", required: true },
    { label: "Yes", name: "otherAuth", inputType: "radio", placeholder: "", required: true },
  ];
  const checkedStates = { "radio-1": false, "radio-2": true, "radio-3": false, "radio-4": false };
  const radio = harness(value, undefined, undefined, undefined, undefined, checkedStates);
  const observed = await execute(radio.get("browser_recruiting_form_observe"), {});
  const fields = fieldViewsOf(observed);
  assert.notEqual(fields[0]!.id, fields[1]!.id);
  assert.notEqual(fields[2]!.id, fields[3]!.id);
  await execute(radio.get("browser_recruiting_form_set_checked"), { fillId: fields[1]!.id, checked: true });
  assert.equal(radio.calls.includes("checked:radio-2"), true);
  await assert.rejects(execute(radio.get("browser_recruiting_form_review"), {}), /required_field_blank/u);
  checkedStates["radio-4"] = true;
  await execute(radio.get("browser_recruiting_form_observe"), {});
  await execute(radio.get("browser_recruiting_form_review"), {});
  assert.equal(radio.calls.at(-1), "review");
});

test("required checkbox review trusts the host checked state", async () => {
  const uncheckedFixture = fixture();
  uncheckedFixture.page.formFields[2]!.required = true;
  const unchecked = harness(uncheckedFixture, undefined, undefined, "选中", false);
  await execute(unchecked.get("browser_recruiting_form_observe"), {});
  await assert.rejects(execute(unchecked.get("browser_recruiting_form_review"), {}), /required_field_blank/u);
  const checked = harness(uncheckedFixture, undefined, undefined, "选中", true);
  await execute(checked.get("browser_recruiting_form_observe"), {});
  await execute(checked.get("browser_recruiting_form_review"), {});
  assert.deepEqual(checked.calls, ["review"]);
});
