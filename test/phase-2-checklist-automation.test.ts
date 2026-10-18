import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderer(path: string): Promise<string> {
  return readFile(new URL(`../src/desktop/renderer/src/${path}`, import.meta.url), "utf8");
}

async function assertNoNativeSelect(label: string, path: string): Promise<void> {
  const source = await renderer(path);
  assert.equal(/<select\b/u.test(source), false, `${label} still contains native <select>`);
  assert.match(source, /DialogSelect/u, `${label} should use DialogSelect`);
}

test("[A1-ui] Profile edit form uses DialogSelect for career and resume defaults", async () => {
  await assertNoNativeSelect("ProfileDialog", "components/ProfileDialog.vue");
  const profile = await renderer("components/ProfileDialog.vue");
  assert.match(profile, /useProfileSelectOptions/u);
  assert.match(profile, /ProfileSyncBanner/u);
  assert.match(profile, /profile-dialog-footer/u);
});

test("[A2-ui] Preference list footer spacing and DialogSelect on form", async () => {
  await assertNoNativeSelect("PreferenceDialog", "components/PreferenceDialog.vue");
  const css = await renderer("styles/preference-dialog.css");
  assert.match(css, /\.preference-dialog > \.dialog-actions/u);
  const lifecycle = await renderer("app/use-app-lifecycle.ts");
  assert.match(lifecycle, /preferenceTrigger/u);
});

test("[C1] Settings shell layout and focus trap markers", async () => {
  const settings = await renderer("components/SettingsDialog.vue");
  assert.match(settings, /data-settings-shell/u);
  const css = await renderer("styles/base-settings-dialog.css");
  assert.match(css, /920px/u);
  assert.match(css, /560px/u);
  assert.match(css, /settings-dialog-pane/u);
});

test("[C2] Tracker and experience dialogs migrated to DialogSelect", async () => {
  const paths = [
    "components/ApplicationEditorFields.vue",
    "components/InterviewEditorDialog.vue",
    "components/NoteEditorDialog.vue",
    "components/ReminderEditorDialog.vue",
    "components/ExperienceEditor.vue",
    "components/ExperienceDateFields.vue",
  ];
  for (const path of paths) await assertNoNativeSelect(path, path);
});

test("[C2] Agent loop dialogs migrated to DialogSelect", async () => {
  const paths = [
    "agent-tasks/ApplicationLoopDialog.vue",
    "agent-tasks/GlobalAiLoopDialog.vue",
    "agent-tasks/MailScheduleLoopDialog.vue",
    "agent-tasks/ResumeJobLoopDialog.vue",
  ];
  for (const path of paths) await assertNoNativeSelect(path, path);
});

test("[C4-known] Resume library still uses native select; material uses custom status filter", async () => {
  const material = await renderer("material/MaterialLibraryView.vue");
  const materialFilter = await renderer("material/MaterialLibraryStatusFilter.vue");
  const resume = await renderer("components/ResumeLibraryView.vue");
  assert.equal(/<select\b/u.test(material), false, "MaterialLibraryView should not use native <select>");
  assert.equal(/<select\b/u.test(materialFilter), false, "MaterialLibraryStatusFilter should not use native <select>");
  assert.match(materialFilter, /material-status-filter/u);
  assert.match(resume, /<select\b/u);
});

test("[C1] Settings keeps Profile/Preference open without closing on nested open", async () => {
  const lifecycle = await renderer("app/use-app-lifecycle.ts");
  assert.match(lifecycle, /openProfileFromSettings/u);
  assert.match(lifecycle, /openPreferencesFromSettings/u);
  assert.match(lifecycle, /if \(settingsDialogOpen\.value\)/u);
});
