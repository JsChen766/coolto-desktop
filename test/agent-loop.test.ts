import assert from "node:assert/strict";
import test from "node:test";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

import { createCooltoAgent } from "../src/agent/create-agent.js";
import type { CooltoAgentEvent } from "../src/agent/events.js";
import { createToolRegistry } from "../src/tools/registry.js";

test("single agent completes a model-selected tool loop", async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("get_runtime_info", {}, { id: "tool-call-1" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("当前运行的是单一的本地 Pi Agent。"),
  ]);

  const events: CooltoAgentEvent[] = [];
  const agent = createCooltoAgent(
    {
      tools: createToolRegistry(),
    },
    {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
  );

  agent.subscribe((event) => {
    events.push(event);
  });

  await agent.prompt("请告诉我你的运行架构");

  assert.equal(faux.state.callCount, 2);
  assert.ok(
    events.some(
      (event) =>
        event.type === "tool.started" &&
        event.name === "get_runtime_info",
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "message.delta" &&
        event.text.length > 0,
    ),
  );
  assert.equal(events.at(-1)?.type, "run.completed");
});
