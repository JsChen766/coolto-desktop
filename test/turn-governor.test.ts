import assert from "node:assert/strict";
import test from "node:test";

import type { ShouldStopAfterTurnContext } from
  "@earendil-works/pi-agent-core";

import { createTurnGovernor } from "../src/agent/turn-governor.js";

test("turn governor keeps the existing pre-phase limit", () => {
  const governor = createTurnGovernor({
    maxTurns: 3,
    phaseMaxTurns: 2,
    maxTotalTurns: 8,
  });

  assert.equal(governor.evaluate(turn(1)), false);
  assert.equal(governor.evaluate(turn(2)), false);
  assert.equal(governor.evaluate(turn(3)), true);
  assert.equal(governor.stopReason, "maximum_turns");
});

test("turn governor grants one bounded budget after a resume phase change", () => {
  const governor = createTurnGovernor({
    maxTurns: 4,
    phaseMaxTurns: 3,
    maxTotalTurns: 10,
  });

  assert.equal(governor.evaluate(turn(1, "resume_generation")), false);
  assert.equal(governor.evaluate(turn(2, "resume_generation")), false);
  assert.equal(governor.evaluate(turn(3, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(4, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(5, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(6, "resume_tail_repair")), true);
  assert.equal(governor.stopReason, "maximum_phase_turns");
});

test("turn governor absolute limit cannot be reset by a phase change", () => {
  const governor = createTurnGovernor({
    maxTurns: 5,
    phaseMaxTurns: 5,
    maxTotalTurns: 6,
  });

  assert.equal(governor.evaluate(turn(1, "resume_generation")), false);
  assert.equal(governor.evaluate(turn(2, "resume_generation")), false);
  assert.equal(governor.evaluate(turn(3, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(4, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(5, "resume_tail_repair")), false);
  assert.equal(governor.evaluate(turn(6, "resume_tail_repair")), true);
  assert.equal(governor.stopReason, "maximum_total_turns");
});

test("a new user prompt receives a fresh operation budget", () => {
  const governor = createTurnGovernor({ maxTurns: 2 });

  assert.equal(governor.evaluate(turn(1)), false);
  assert.equal(governor.evaluate(turn(2)), true);
  assert.equal(governor.stopReason, "maximum_turns");

  governor.reset();

  assert.equal(governor.evaluate(turn(3)), false);
  assert.equal(governor.stopReason, undefined);
});

function turn(
  index: number,
  phaseKey?: string,
): ShouldStopAfterTurnContext {
  const toolResults = phaseKey
    ? [{
        toolName: "phase_probe",
        isError: false,
        content: [{ type: "text", text: `result-${index}` }],
        details: {
          loopGuardKey: `progress-${index}`,
          turnGovernorPhaseKey: phaseKey,
        },
      }]
    : [];
  return {
    message: {
      role: "assistant",
      content: [],
      stopReason: toolResults.length ? "toolUse" : "stop",
    },
    toolResults,
    newMessages: [{ role: "user", content: "same run", timestamp: 1 }],
  } as unknown as ShouldStopAfterTurnContext;
}
