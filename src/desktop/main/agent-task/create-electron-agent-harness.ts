import { AgentHarnessServices } from "../../../agent-task/agent-harness-services.js";
import { AgentHarnessStateRepository } from "../../../agent-task/agent-harness-state-repository.js";
import { ElectronAgentEvidenceStore } from "./electron-agent-evidence-store.js";
import { ElectronAgentHarnessPersistence } from "./electron-agent-harness-persistence.js";

export async function createElectronAgentHarness(
  ownerId: string,
): Promise<AgentHarnessServices> {
  const evidence = new ElectronAgentEvidenceStore(ownerId);
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(
      ownerId,
      new ElectronAgentHarnessPersistence(ownerId),
    ),
    evidence,
  );
  await evidence.clearExpired();
  return services;
}
