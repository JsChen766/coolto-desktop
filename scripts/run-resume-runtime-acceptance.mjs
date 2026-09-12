import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import electron from "electron";

class CdpClient {
  static async connect(url, child) {
    const client = new CdpClient(url); let timer; let onExit;
    try {
      await Promise.race([client.open(), new Promise((_, reject) => {
        onExit = () => reject(new Error("Electron exited before CDP connected"));
        if (child.exitCode !== null) onExit(); else child.once("exit", onExit);
        timer = setTimeout(() => reject(new Error("CDP connection timed out")), 10000);
      })]);
      return client;
    } catch (error) { client.close(); throw error; }
    finally { clearTimeout(timer); if (onExit) child.removeListener("exit", onExit); }
  }
  constructor(url) { this.socket = new WebSocket(url); this.nextId = 1; this.pending = new Map(); this.listeners = new Map(); }
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }
  open() { return new Promise((resolvePromise, reject) => { const failure = () => { this.rejectPending(new Error("CDP WebSocket failed")); reject(new Error("CDP WebSocket failed")); }; this.socket.addEventListener("open", resolvePromise, { once: true }); this.socket.addEventListener("error", failure, { once: true }); this.socket.addEventListener("close", () => this.rejectPending(new Error("CDP WebSocket closed")), { once: true }); this.socket.addEventListener("message", (event) => this.receive(event.data)); }); }
  send(method, params = {}) { const id = this.nextId++; return new Promise((resolvePromise, reject) => { this.pending.set(id, { resolve: resolvePromise, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  receive(raw) { const message = JSON.parse(String(raw)); if (message.id === undefined) { for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {}); return; } const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result ?? {}); }
  rejectPending(error) { this.pending.forEach(({ reject }) => reject(error)); this.pending.clear(); }
  close() { this.rejectPending(new Error("CDP client closed")); this.listeners.clear(); this.socket.close(); }
}

const CANDIDATE_ID = "00000000-0000-4000-8000-000000000001";
const LOCAL_ID = "00000000-0000-4000-8000-000000000002";
const CLOUD_ID = "cloud-source-synthetic";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000003";
const OWNER_ID = "runtime-synthetic-owner";
const root = await mktemp("coolto-res-runtime-");
const userData = join(root, "user-data");
const renderer = resolve("out/renderer/index.html");
const started = Date.now();
try {
  assert.ok(existsSync(renderer), "run npm run desktop:build first");
  await mkdir(userData, { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const sourcePath = join(userData, "synthetic-sources.json");
  await writeFile(sourcePath, JSON.stringify(syntheticSources()), "utf8");
  const preload = join(root, "preload.cjs");
  const entry = join(root, "main-entry.mjs");
  const main = join(root, "main-bundle.mjs");
  await writeFile(preload, preloadSource(), "utf8");
  await writeFile(entry, preparedMainSource(), "utf8");
  await bundle(entry, main);
  const first = await session({ main, preload, renderer, userData, port: 0, actions: true });
  const saved = JSON.parse(await readFile(join(userData, "runtime-save-receipt.json"), "utf8"));
  const exported = JSON.parse(await readFile(join(userData, "runtime-export-receipt.json"), "utf8"));
  const sourceState = JSON.parse(await readFile(sourcePath, "utf8"));
  const saveCall = first.calls.find((call) => call.name === "resumeDrafts.save");
  const exportCall = first.calls.find((call) => call.name === "resumeDrafts.exportPdf");
  assert.equal(first.snapshot.terminalStatus, "ready_for_approval");
  assert.equal(first.snapshot.generationReady, true);
  assert.equal(first.snapshot.saveButtonDisabled, false);
  assert.equal(first.snapshot.exportButtonDisabled, false);
  assert.equal(saved.deliveryManifest.revision, first.snapshot.revision);
  assert.equal(exported.result.status, "exported");
  assert.equal(saveCall?.input.expectedRevision, first.snapshot.revision);
  assert.equal(exportCall?.input.expectedRevision, first.snapshot.revision);
  await writeFile(sourcePath, JSON.stringify({ ...sourceState, sourceFingerprint: "synthetic-source-drift" }), "utf8");
  const driftError = await session({ main, preload, renderer, userData, port: 0, actions: false, expectDrift: true }).then(() => "").catch((error) => String(error));
  assert.match(driftError, /source drift rejected/iu);
  await sleep(500);
  await writeFile(sourcePath, JSON.stringify(sourceState), "utf8");
  const restart = await session({ main, preload, renderer, userData, port: 0, actions: false });
  const rereads = JSON.parse(await readFile(join(userData, "runtime-source-rereads.json"), "utf8"));
  const restartState = { revision: rereads.restartRevision, sourceFingerprint: rereads.restartSourceFingerprint };
  const productPdf = await readFile(join(userData, "product-export.pdf"));
  for (const state of [first.snapshot, restart.snapshot]) {
    assert.equal(state.generationReady, true);
    assert.equal(state.previewVisible, true);
    assert.equal(state.terminalVisible, true);
    assert.equal(state.terminalStatus, "ready_for_approval");
    assert.equal(state.saveButtonDisabled, false);
    assert.equal(state.exportButtonDisabled, false);
  }
  assert.equal(restartState.revision, first.snapshot.revision);
  assert.equal(restartState.sourceFingerprint, sourceState.sourceFingerprint);
  for (const key of ["profile", "jd", "experience", "cloud", "local", "composite"]) assert.ok(rereads[key]?.length, `product restorer did not reread ${key}`);
  const result = {
    passed: true,
    mode: "isolated-electron-cdp-synthetic-product-path",
    wallClockMs: Date.now() - started,
    userDataReused: true,
    persistedDraftRevision: restartState.revision,
    restartStateSource: "ResumeDraftFileRepository through product IPC/restorer",
    firstRun: first.snapshot,
    restartRun: restart.snapshot,
    firstRunCalls: first.calls.map((call) => call.name),
    delivery: {
      previewManifest: saveCall?.input.deliveryManifest ?? null,
      saveManifest: saved.deliveryManifest,
      pdfManifest: exported.deliveryManifest,
      sameRevision: sameRevision(saveCall?.input.deliveryManifest, saved.deliveryManifest) && sameRevision(saveCall?.input.deliveryManifest, exported.deliveryManifest),
      savePath: "buildDraftSavePayload + publication gateway recorder",
      pdfPath: "ResumePdfExportService + PDF postflight + product writer",
    },
    syntheticSourceReread: rereads,
    productExport: { status: exported.result.status, pdfSha256: hash(productPdf), adapter: "ResumePdfExportService" },
    rendererScreenshotSha256: first.rendererScreenshotSha256,
    syntheticSourceDriftRejection: true,
    realModel600sSameRevisionCloud: "U",
  };
  assert.equal(result.delivery.sameRevision, true);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
}

function syntheticSources() {
  return {
    schemaVersion: "res-runtime-sources-v1",
    sourceFingerprint: "synthetic-source-v1",
    profile: { id: "profile-synthetic" },
    jd: { id: "qa-jd" },
    experience: { ids: [] },
    cloud: { sourceId: CLOUD_ID, contentHash: "cloud-content-v1", updatedAt: "2026-09-08T00:00:00.000Z" },
    local: { artifactId: LOCAL_ID, contentHash: null },
    composite: { sourceId: "composite-source-synthetic" },
  };
}

function preloadSource() {
  return `const{contextBridge,ipcRenderer}=require("electron"),calls=[],clone=(v)=>JSON.parse(JSON.stringify(v)),record=(name,input)=>calls.push({name,...(input===undefined?{}:{input:clone(input)})}),off=()=>()=>{},privacyState={available:true,policy:{policyVersion:"privacy-2026-09-08-v1",contentHash:"30521add8e9658ff045bfcca9db58c14cee14d5be4b15c13b93641bb566b7c3a",effectiveAt:"2026-09-08T00:00:00Z",changeClass:"major"},consent:{policyVersion:"privacy-2026-09-08-v1",status:"accepted",acceptedAt:"2026-09-08T00:00:00Z",decisionAt:"2026-09-08T00:00:00Z"},localAccepted:true,error:null},deletionState={status:"idle",requestId:null,retryable:false,steps:[],thirdPartyDataUnaffected:true,message:null,updatedAt:null,completedAt:null},no=async()=>undefined,conversation=()=>ipcRenderer.invoke("coolto-runtime:conversation"),invoke=(channel,name,input)=>{record(name,input);return ipcRenderer.invoke(channel,input)},conversations={list:async()=>{record("conversations.list");return[await conversation()]},get:async(id)=>{record("conversations.get",{id});return conversation()},create:conversation,createForResume:conversation,bindResume:async(i)=>{record("conversations.bindResume",i);return conversation()},clearResumeContext:conversation,rename:async()=>conversation(),delete:no},resumeDrafts={list:async()=>invoke("resume-drafts:list","resumeDrafts.list"),get:async(id)=>invoke("resume-drafts:get","resumeDrafts.get",id),edit:async(i)=>invoke("resume-drafts:edit","resumeDrafts.edit",i),setLineSpacing:async(i)=>invoke("resume-drafts:set-line-spacing","resumeDrafts.setLineSpacing",i),restore:async(i)=>invoke("resume-drafts:restore","resumeDrafts.restore",i),accept:async(i)=>invoke("resume-drafts:accept","resumeDrafts.accept",i),reject:async(i)=>invoke("resume-drafts:reject","resumeDrafts.reject",i),exportPdf:async(i)=>{const r=await invoke("resume-drafts:export-pdf","resumeDrafts.exportPdf",i);record("resumeDrafts.exportPdf.result",r);return r},save:async(i)=>{const r=await invoke("resume-drafts:save","resumeDrafts.save",i);record("resumeDrafts.save.result",r);return r}},fallback={list:no,get:no,create:no,rename:no,archive:no,deleteDraft:no,getCheckpoints:no,restoreCheckpoint:no,importFile:no,select:no,search:no,history:no,prepareCreate:no,prepareUpdate:no,prepareArchive:no,prepareRestore:no,prepareDelete:no,prepareRestoreRevision:no,syncIssue:no,prepareAcceptServer:no,prepareReapply:no,prepareSaveAsNew:no,executeProposal:no,detail:no,overview:no,syncIssues:no,prepareRecovery:no,executeRecovery:no,retryPending:no,providers:no,connect:no,disconnect:no,open:no,close:no,navigate:no,goBack:no,goForward:no,reload:no,abortFill:no,onStateChanged:off,onFillProgress:off,onReviewDecision:off,onReviewComplete:off,onCaptchaDetected:off,onOpenAgentTask:off,onOpenPageInApp:off,onSyncCompleted:off,onStateChange:off,onSaveBeforeClose:off},api={platform:"win32",auth:{getCurrentUser:async()=>({id:"synthetic-user",email:"synthetic@example.invalid"}),getCredits:async()=>({weeklyFreeCredits:0,creditBalance:0,unlimited:true,weeklyFreeExpiresAt:null,creditExpiresAt:null,planType:"SYNTHETIC",hasFreeTrial:false,recentTransactions:[]}),requestEmailCode:no,verifyEmailCode:no,logout:no,syncNow:no,onSyncCompleted:off},privacy:{getState:async()=>clone(privacyState),accept:async()=>clone(privacyState),decline:async()=>clone(privacyState),exportData:async()=>({status:"cancelled",fileName:null,mode:null}),startDeletion:async()=>clone(deletionState),retryDeletion:async()=>clone(deletionState),acknowledgeDeletion:async()=>clone(deletionState),getDeletionState:async()=>clone(deletionState),onStateChange:off,onDeletionStateChange:off},checkout:fallback,shell:fallback,conversations,attachments:fallback,resumeDrafts,updates:{getState:async()=>({phase:"idle",currentVersion:"synthetic",updateVersion:null,percent:null,message:null,errorStage:null}),check:no,install:no,onStateChange:off},library:fallback,deliveryResumeFiles:fallback,jobAssets:{get:async()=>({jobs:[]})},experiences:fallback,profile:fallback,applications:fallback,tracker:fallback,interviews:fallback,notes:fallback,reminders:fallback,onboarding:{status:async()=>({state:"completed",step:"complete"}),start:no,advance:no,openBrowserDemo:no,complete:no},agent:{prompt:no,cancel:no,pendingApprovals:async()=>[],resolveApproval:no,onEvent:off},agentTasks:fallback,mailConnections:fallback,calendar:{...fallback,status:async()=>({}),requestAccess:no,openSystemSettings:no,syncInterview:no,onOpenInterview:off},window:{...fallback,minimize:no,toggleMaximize:no,close:()=>ipcRenderer.invoke("coolto-runtime:quit"),reportDraftSaveState:no,completeSaveBeforeClose:no,onSaveBeforeClose:off},data:{clearLocal:no},browser:{...fallback,getState:async()=>({isOpen:false,currentUrl:null,pageTitle:null,isLoading:false,canGoBack:false,canGoForward:false,pageType:"unknown"})}};contextBridge.exposeInMainWorld("coolto",api);contextBridge.exposeInMainWorld("__cooltoRuntimeProbe",{calls:()=>clone(calls),quit:()=>ipcRenderer.invoke("coolto-runtime:quit")});`;
}

function mainSource() {
  const p = (path) => JSON.stringify(resolve(path).replaceAll("\\", "/"));
  return `import{app,BrowserWindow,ipcMain}from"electron";import{readFile,writeFile}from"node:fs/promises";import{join}from"node:path";import{createElectronResumeDraftRepository as createRepo}from${p("src/desktop/main/resume-drafts/electron-draft-repository.ts")};import{ResumeDraftService}from${p("src/desktop/main/resume-drafts/resume-draft-service.ts")};import{ResumeDraftEditingService}from${p("src/desktop/main/resume-drafts/draft-editing-service.ts")};import{ResumePdfExportService}from${p("src/desktop/main/resume-pdf-export-service.ts")};import{ElectronResumeCompilerService}from${p("src/desktop/main/resume-compiler-service.ts")};import{ResumeManualEditor}from${p("src/resume/draft/manual-editor.ts")};import{createLocalResumeDraft}from${p("src/resume/draft/projection.ts")};import{localDraftContentHash}from${p("src/resume/reuse/local-draft-source.ts")};import{registerResumeDraftIpc}from${p("src/desktop/main/resume-drafts/resume-draft-ipc.ts")};import{assertResumeWorkspaceCurrent}from${p("src/desktop/main/resume-drafts/resume-conversation-restorer.ts")};import{ResumeWorkspaceStore}from${p("src/resume/workspace/workspace-store.ts")};import{createRunTerminalForContext}from${p("src/desktop/main/agent-runtime-terminal.ts")};import{createResumeWorkspaceQaFixture,qaBindingFor}from${p("src/desktop/main/resume-workspace-qa-fixture.ts")};import{ResumeCandidatePreparer}from${p("src/resume/workspace/candidate-preparer.ts")};import{ResumeCandidatePatcher}from${p("src/resume/workspace/candidate-patcher.ts")};import{ResumeCandidateReviewer}from${p("src/resume/quality/candidate-reviewer.ts")};import{ResumeQualityEvaluator}from${p("src/resume/quality/quality-evaluator.ts")};import{STANDARD_RESUME_TEMPLATE_SNAPSHOT}from${p("src/resume/template-contract.ts")};import{sha256,stableStringify}from${p("src/resume/stable-snapshot.ts")};const O=${JSON.stringify(OWNER_ID)},C=${JSON.stringify(CANDIDATE_ID)},L=${JSON.stringify(LOCAL_ID)},Q=${JSON.stringify(CLOUD_ID)},V=${JSON.stringify(CONVERSATION_ID)},sourcePath=()=>join(app.getPath("userData"),"synthetic-sources.json"),readSources=async()=>JSON.parse(await readFile(sourcePath(),"utf8")),writeJson=async(name,value)=>writeFile(join(app.getPath("userData"),name),JSON.stringify(value,null,2),"utf8");app.disableHardwareAcceleration();app.setPath("userData",process.env.COOLTO_RUNTIME_USER_DATA);let compiler;app.whenReady().then(async()=>{try{compiler=new ElectronResumeCompilerService(ipcMain);const repository=createRepo(O),drafts=new ResumeDraftService(O,repository),existing=(await repository.list()).find((draft)=>draft.artifactId===C);let candidate=existing;if(!candidate){const workspace=await buildWorkspace(compiler),source=await readSources(),local=createLocalResumeDraft({ownerId:O,conversationId:V,artifactId:L,workspace}),localHash=localDraftContentHash(local),sources=[{experienceId:"qa-cloud-experience",kind:"cloud",sourceId:Q,updatedAt:source.cloud.updatedAt,contentHash:source.cloud.contentHash},{experienceId:"qa-local-experience",kind:"local",sourceId:L,updatedAt:local.updatedAt,contentHash:localHash}],finalWorkspace={...workspace,reuseBase:{kind:"composite",resumeId:"composite-source-synthetic",sourceJdId:workspace.sourceSnapshot.jd?.id??null,contentHash:sha256(stableStringify(sources)),retainedBulletCount:0,droppedBulletCount:0,sources}};candidate=createLocalResumeDraft({ownerId:O,conversationId:V,artifactId:C,workspace:finalWorkspace});await repository.save(local);await repository.save(candidate);await writeFile(sourcePath(),JSON.stringify({...source,sourceFingerprint:workspace.sourceSnapshot.sourceFingerprint,experience:{ids:workspace.sourceSnapshot.experiences.map((item)=>item.id)},local:{...source.local,contentHash:localHash}},null,2),"utf8")}const current=await repository.get(C),rereads={profile:[],jd:[],experience:[],cloud:[],local:[],composite:[]},sourceBuilder={build:async(input)=>{const source=await readSources();rereads.profile.push(source.profile.id);rereads.jd.push(input.jdId);rereads.experience.push(...input.experienceIds);if(source.jd.id!==input.jdId||!input.experienceIds.every((id)=>source.experience.ids.includes(id)))throw new Error("synthetic source drift rejected");return{sourceFingerprint:source.sourceFingerprint}},buildGeneral:async(input)=>{const source=await readSources();rereads.profile.push(source.profile.id);rereads.experience.push(...input.experienceIds);return{sourceFingerprint:source.sourceFingerprint}}},resumeReader={getResume:async(id)=>{const source=await readSources();rereads.cloud.push(id);if(id!==source.cloud.sourceId)throw new Error("synthetic cloud source drift rejected");return{contentHash:source.cloud.contentHash,updatedAt:source.cloud.updatedAt}}},draftReader={get:(id)=>drafts.get(id),getReusableDraft:async(id)=>{const source=await readSources();rereads.local.push(id);if(id!==source.local.artifactId)throw new Error("synthetic local source drift rejected");return drafts.getReusableDraft(id)}};try{await assertResumeWorkspaceCurrent(current.workspace,draftReader,{sourceBuilder,resumeReader})}catch(error){if(process.env.COOLTO_RUNTIME_EXPECT_DRIFT==="1"){console.error("synthetic source drift rejected by product restorer",error);app.exitCode=1;app.quit();return}throw error}if(current.workspace.reuseBase?.kind==="composite")rereads.composite.push(current.workspace.reuseBase.resumeId);await writeJson("runtime-source-rereads.json",rereads);const editing=new ResumeDraftEditingService(drafts,new ResumeManualEditor(compiler)),pdf=new ResumePdfExportService(compiler,{choosePath:async()=>join(app.getPath("userData"),"product-export.pdf")}),recordPublication=async(payload,idempotencyKey)=>{await writeJson("runtime-save-receipt.json",{candidateId:payload.candidateId,candidateRevision:payload.candidateRevision,deliveryManifest:payload.deliveryManifest,idempotencyKey});return{}},publication={listResumes:async()=>[],getResume:async()=>{throw new Error("synthetic cloud read is not used by save")},publishNew:recordPublication,publishExisting:recordPublication};registerResumeDraftIpc(ipcMain,async()=>({resumeDrafts:drafts,resumeDraftEditing:editing,resumes:publication,resumePdfExports:{exportPdf:async(payload)=>{const result=await pdf.exportPdf(payload);await writeJson("runtime-export-receipt.json",{deliveryManifest:payload.deliveryManifest,result});return result}}}));ipcMain.handle("coolto-runtime:conversation",async()=>{const draft=await drafts.get(C),store=new ResumeWorkspaceStore();store.restore(draft.workspace);const terminal=createRunTerminalForContext({workspaceStore:store,artifactIdByCandidate:new Map([[draft.workspace.candidateId,C]])},false);return{id:V,title:"合成简历运行验收",createdAt:draft.createdAt,updatedAt:draft.updatedAt,messageCount:2,activeResumeArtifactId:C,resumeArtifacts:[drafts.artifactReference(draft)],experienceImportArtifacts:[],messages:[{id:"m1",role:"user",content:"查看当前简历",createdAt:draft.createdAt},{id:"m2",role:"assistant",content:"当前简历已生成，请查看交付状态。",createdAt:draft.updatedAt}],lastRun:terminal}});ipcMain.handle("coolto-runtime:quit",()=>app.quit());const window=new BrowserWindow({width:1280,height:820,show:true,webPreferences:{preload:process.env.COOLTO_RUNTIME_PRELOAD,contextIsolation:true,nodeIntegration:false,sandbox:true}});void window.loadFile(process.env.COOLTO_RUNTIME_RENDERER).catch((error)=>{if(error?.code!=="ERR_ABORTED"){console.error(error);app.quit()}})}catch(error){console.error(error);process.exitCode=1;app.quit()}});app.on("window-all-closed",()=>{compiler?.dispose();app.quit()});async function buildWorkspace(compiler){const{builder,sourceItems,experienceIds}=createResumeWorkspaceQaFixture(),store=new ResumeWorkspaceStore(),preparer=new ResumeCandidatePreparer(builder,compiler,store,{createCandidateId:()=>C}),snapshot=await builder.build({jdId:"qa-jd",experienceIds,template:STANDARD_RESUME_TEMPLATE_SNAPSHOT}),prepared=await preparer.prepare({jdId:"qa-jd",experienceIds,language:"zh-CN"}),patcher=new ResumeCandidatePatcher(compiler,store),operations=sourceItems.flatMap(({item})=>item.bullets.map((bullet)=>({op:"add_bullet",itemId:"item-"+item.source_experience_id,binding:qaBindingFor(snapshot,item,bullet.id,bullet.text)}))),patched=await patcher.patch({candidateId:C,expectedRevision:prepared.revision,operations});return new ResumeCandidateReviewer(new ResumeQualityEvaluator(),store).review(C,patched.revision)}`;
}

function preparedMainSource() {
  const p = (path) => JSON.stringify(resolve(path).replaceAll("\\", "/"));
  const storePath = p("src/desktop/main/conversation-store.ts");
  const servicePath = p("src/desktop/main/resume-drafts/resume-draft-service.ts");
  return mainSource()
    .replace(`import{ResumeDraftService}from${servicePath};`, `import{ConversationStore}from${storePath};import{ResumeDraftService}from${servicePath};`)
    .replace(`,V=${JSON.stringify(CONVERSATION_ID)}`, "")
    .replaceAll("conversationId:V", "conversationId")
    .replace("id:V,title:", "id:conversationId,title:")
    .replace("app.disableHardwareAcceleration();", "let conversationId;app.setName(\"coolto-local-agent\");app.setAppUserModelId(\"com.coolto.local-agent\");app.disableHardwareAcceleration();")
    .replace("compiler=new ElectronResumeCompilerService(ipcMain);const repository=", "compiler=new ElectronResumeCompilerService(ipcMain);const conversations=new ConversationStore(\"https://synthetic.example\",O),conversationRecordPath=join(app.getPath(\"userData\"),\"runtime-conversation-id.json\"),conversationRecord=await readFile(conversationRecordPath,\"utf8\").then(JSON.parse).catch(()=>undefined);conversationId=conversationRecord?.id??(await conversations.create()).id;await writeJson(\"runtime-conversation-id.json\",{id:conversationId});const repository=")
    .replace("const repository=createRepo(O)", "const repository=createRepo(\"https://synthetic.example\",O)")
    .replace('await writeJson("runtime-source-rereads.json",rereads);', 'await writeJson("runtime-source-rereads.json",{...rereads,restartRevision:current.workspace.revision,restartSourceFingerprint:current.workspace.sourceSnapshot.sourceFingerprint});')
    .replace(/ipcMain\.handle\("coolto-runtime:conversation"[\s\S]*?ipcMain\.handle\("coolto-runtime:quit"/u, 'await conversations.addResumeArtifact(conversationId,drafts.artifactReference(current));const terminalStore=new ResumeWorkspaceStore();terminalStore.restore(current.workspace);const terminal=createRunTerminalForContext({workspaceStore:terminalStore,artifactIdByCandidate:new Map([[current.workspace.candidateId,current.artifactId]])},false);await conversations.saveRunTerminal(conversationId,terminal);const storedConversation=await conversations.get(conversationId);await writeJson("runtime-restart-state.json",{artifactId:current.artifactId,revision:current.workspace.revision,sourceFingerprint:current.workspace.sourceSnapshot.sourceFingerprint,terminalStatus:storedConversation.lastRun?.status});ipcMain.handle("coolto-runtime:conversation",()=>conversations.get(conversationId));ipcMain.handle("coolto-runtime:quit"')
    .replace("return new ResumeCandidateReviewer(new ResumeQualityEvaluator(),store).review(C,patched.revision)", "const reviewed=new ResumeCandidateReviewer(new ResumeQualityEvaluator(),store).review(C,patched.revision);return{...reviewed,compileObservedRevision:reviewed.revision,itemTiers:Object.fromEntries(sourceItems.filter(({sectionType})=>sectionType!==\"education\"&&sectionType!==\"skills\").map(({item},index)=>[item.id,index===0?\"main\":\"secondary\"]))}")
    .replace("finalWorkspace={...workspace,reuseBase:{", "finalWorkspace={...workspace,itemTiers:Object.fromEntries(workspace.structure.sections.flatMap((section)=>section.type===\"education\"||section.type===\"skills\"?[]:section.items.map((item)=>[item.id,\"secondary\"]))),reuseBase:{");
}

async function bundle(entry, output) {
  await runProcess(process.execPath, [resolve("node_modules/esbuild/bin/esbuild"), entry, "--bundle", "--platform=node", "--format=esm", "--external:electron", "--external:@napi-rs/keyring", "--external:pdfjs-dist", `--outfile=${output}`]);
}

async function session(input) {
  const env = { ...process.env, COOLTO_RUNTIME_USER_DATA: input.userData, COOLTO_RUNTIME_PRELOAD: input.preload, COOLTO_RUNTIME_RENDERER: input.renderer, RESUME_RENDERER_DIR: resolve("out"), COOLTO_RUNTIME_EXPECT_DRIFT: input.expectDrift ? "1" : "0", NODE_PATH: resolve("node_modules") };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [input.main, `--user-data-dir=${input.userData}`, `--remote-debugging-port=${input.port}`], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-4000); });
  child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-4000); });
  if (input.expectDrift) { await waitExit(child); await sleep(100); throw new Error(`Expected source drift rejection\nElectron output:\n${output}`); }
  const diagnostics = emptyRendererDiagnostics();
  try {
    const cdp = await connectCdp(input.port, child, () => output);
    const detachDiagnostics = captureRendererDiagnostics(cdp, diagnostics);
    try {
      await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Network.enable"); await cdp.send("Page.enable");
      diagnostics.consoleErrors.length = 0; diagnostics.pageErrors.length = 0; diagnostics.resourceErrors.length = 0;
      const loadEvent = waitForEvent(cdp, "Page.loadEventFired");
      await cdp.send("Page.reload"); await loadEvent;
      await waitFor(cdp, `Boolean(document.querySelector('[data-testid="resume-active-draft-status"]')&&document.querySelector('.chat-run-terminal.is-ready_for_approval'))`);
      if (input.actions) {
        await evaluate(cdp, `([...document.querySelectorAll('button.icon-button')].find((button)=>/保存|save/iu.test(button.getAttribute('aria-label')||'')))?.click()`);
        await waitFor(cdp, `window.__cooltoRuntimeProbe.calls().some((call)=>call.name==='resumeDrafts.save.result')`);
        await evaluate(cdp, `([...document.querySelectorAll('button.icon-button')].find((button)=>/导出|export/iu.test(button.getAttribute('aria-label')||'')))?.click()`);
        await waitFor(cdp, `window.__cooltoRuntimeProbe.calls().some((call)=>call.name==='resumeDrafts.exportPdf.result')`);
      }
      const snapshot = await evaluate(cdp, `(()=>{const h=document.querySelector('[data-testid="resume-active-draft-status"]'),t=document.querySelector('.chat-run-terminal'),s=[...document.querySelectorAll('button.icon-button')].find((b)=>/保存|save/iu.test(b.getAttribute('aria-label')||'')),p=[...document.querySelectorAll('button.icon-button')].find((b)=>/导出|export/iu.test(b.getAttribute('aria-label')||''));return{revision:Number(h?.dataset.revision||0),generationReady:h?.dataset.generationReady==='true',previewVisible:Boolean(document.querySelector('.artifact-panel .resume-a4-root .resume-document-frame')),terminalVisible:Boolean(t),terminalStatus:t?.classList.contains('is-ready_for_approval')?'ready_for_approval':t?.classList.contains('is-needs_user_decision')?'needs_user_decision':'other',terminalText:t?.textContent?.trim()||'',saveButtonDisabled:s?.disabled??true,exportButtonDisabled:p?.disabled??true}})()`);
      const calls = await evaluate(cdp, "window.__cooltoRuntimeProbe.calls()");
      const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
      if (rendererDiagnosticsHaveErrors(diagnostics)) {
        throw new Error(`Renderer diagnostics captured: ${JSON.stringify(diagnostics)}`);
      }
      await evaluate(cdp, "void window.__cooltoRuntimeProbe.quit()"); await waitExit(child);
      return { snapshot, calls, rendererScreenshotSha256: hash(Buffer.from(screenshot.data, "base64")), rendererDiagnostics: diagnostics };
    } finally { detachDiagnostics(); cdp.close(); }
  } catch (error) {
    if (child.exitCode === null) { const exited = waitExit(child); child.kill(); await exited.catch(() => undefined); }
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nRenderer diagnostics:\n${JSON.stringify(diagnostics)}\nElectron output:\n${output}`);
  }
}
function emptyRendererDiagnostics() { return { consoleErrors: [], pageErrors: [], resourceErrors: [] }; }
function captureRendererDiagnostics(cdp, diagnostics) {
  const unsubscribers = [
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") diagnostics.consoleErrors.push(event.args?.map(remoteValue).join(" ") || "console.error");
    }),
    cdp.on("Runtime.exceptionThrown", (event) => {
      const details = event.exceptionDetails ?? {};
      diagnostics.pageErrors.push(details.exception?.description ?? details.text ?? "uncaught renderer exception");
    }),
    cdp.on("Log.entryAdded", (event) => {
      if (event.entry?.level === "error") diagnostics.consoleErrors.push(event.entry.text ?? "renderer log error");
    }),
    cdp.on("Network.loadingFailed", (event) => {
      diagnostics.resourceErrors.push({ url: event.url ?? "", errorText: event.errorText ?? "", blockedReason: event.blockedReason ?? null, canceled: Boolean(event.canceled) });
    }),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
function remoteValue(value) { return value?.value ?? value?.unserializableValue ?? value?.description ?? ""; }
function rendererDiagnosticsHaveErrors(diagnostics) {
  return diagnostics.consoleErrors.length > 0 || diagnostics.pageErrors.length > 0 ||
    diagnostics.resourceErrors.some((error) => !error.canceled);
}
function waitForEvent(cdp, method) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error(`Timed out waiting for ${method}`)); }, 30000);
    const unsubscribe = cdp.on(method, (event) => {
      clearTimeout(timer);
      unsubscribe();
      resolvePromise(event);
    });
  });
}

async function connectCdp(port, child, readOutput) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const target = await targetFor(port, child, readOutput);
    try { return await CdpClient.connect(target.webSocketDebuggerUrl, child); }
    catch (error) { if (child.exitCode !== null) throw error; await sleep(100); }
  }
  throw new Error("No stable Electron CDP connection within 30 seconds");
}

async function targetFor(port, child, readOutput) {
  const deadline = Date.now() + 30000; let actualPort = port;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron exited with code ${child.exitCode}`);
    if (!actualPort) { const match = readOutput().match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//u); if (match) actualPort = Number(match[1]); }
    try {
      const targets = await (await fetch(`http://127.0.0.1:${actualPort}/json`)).json();
      const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
      const page = pages.find((target) => /\/index\.html(?:$|[?#])/iu.test(target.url ?? ""));
      if (page) return page;
    } catch { /* wait for CDP */ }
    await sleep(100);
  }
  throw new Error("No Electron CDP page target within 30 seconds");
}

async function waitFor(cdp, expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await evaluate(cdp, expression)) return; await sleep(100); }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "CDP evaluation failed");
  return result.result?.value;
}

function sameRevision(left, right) {
  return Boolean(left && right) && left.candidateId === right.candidateId && left.revision === right.revision && left.observedRevision === right.observedRevision && left.sourceFingerprint === right.sourceFingerprint && left.structureHash === right.structureHash && left.compileHash === right.compileHash;
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }
async function mktemp(prefix) { const { mkdtemp } = await import("node:fs/promises"); return mkdtemp(join(tmpdir(), prefix)); }
function waitExit(child) { if (child.exitCode !== null) return Promise.resolve(); return new Promise((resolvePromise, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error("Electron did not exit")); }, 10000); child.once("error", (error) => { clearTimeout(timer); reject(error); }); child.once("exit", () => { clearTimeout(timer); resolvePromise(); }); }); }
function runProcess(command, args) { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); let output = ""; child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Command failed (${code}): ${output}`))); }); }
