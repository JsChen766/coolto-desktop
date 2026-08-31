import assert from "node:assert/strict";
import test from "node:test";

import { tagAccessibleElements } from "../src/desktop/main/browser/browser-accessibility-tagger.js";

test("accessibility tagger maps only interactive AX nodes to fill IDs", async () => {
  let attached = false;
  const commands: string[] = [];
  const contents = {
    getURL: () => "https://outlook.live.com/mail/0/",
    debugger: {
      isAttached: () => attached,
      attach: () => { attached = true; },
      detach: () => { attached = false; },
      sendCommand: async (command: string, _params?: unknown, sessionId?: string) => {
        commands.push(command);
        if (command === "Page.getFrameTree") return {
          frameTree: { frame: { id: "main" } },
        };
        if (command === "Accessibility.getFullAXTree" && !sessionId) return { nodes: [] };
        if (command === "Target.getTargets") return { targetInfos: [
          { targetId: "mail-target", type: "iframe",
            url: "https://outlook.live.com/mail/0/inbox" },
          { targetId: "login-target", type: "iframe",
            url: "https://login.live.com/" },
        ] };
        if (command === "Target.attachToTarget") return { sessionId: "mail-session" };
        if (command === "Accessibility.getFullAXTree" && sessionId === "mail-session") return {
          nodes: [
            { nodeId: "mail-row", role: { value: "option" },
              name: { value: "Message" }, backendDOMNodeId: 42 },
            { nodeId: "subject-a", parentId: "mail-row",
              role: { value: "StaticText" }, name: { value: "Coolto BE5" },
              backendDOMNodeId: 45 },
            { nodeId: "subject-b", parentId: "mail-row",
              role: { value: "StaticText" },
              name: { value: "Outlook QA 20260829" }, backendDOMNodeId: 46 },
            { role: { value: "button" }, name: { value: "Unrelated action" },
              backendDOMNodeId: 44 },
            { role: { value: "textbox" }, name: { value: "Password" },
              backendDOMNodeId: 43 },
          ],
        };
        if (command === "Target.detachFromTarget") return {};
        if (command === "DOM.resolveNode") return { object: { objectId: "node-42" } };
        if (command === "Runtime.callFunctionOn") return { result: { value: {
          fillId: "ax-id", elementType: "other", role: "option",
          text: "QA mail", label: "QA mail", placeholder: "", required: false,
        } } };
        throw new Error(`unexpected command: ${command}`);
      },
    },
  };
  const result = await tagAccessibleElements(
    contents as never, 20, "Coolto BE5 Outlook QA 20260829",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0]?.role, "option");
  assert.match(result[0]?.text ?? "", /Coolto BE5.*Outlook QA 20260829/u);
  assert.deepEqual(commands, [
    "Page.getFrameTree", "Accessibility.getFullAXTree", "Target.getTargets",
    "Target.attachToTarget", "Accessibility.getFullAXTree",
    "DOM.resolveNode", "Runtime.callFunctionOn", "Target.detachFromTarget",
  ]);
  assert.equal(attached, false);
});
