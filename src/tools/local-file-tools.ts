import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { BrowserPageOperator } from "../browser/types.js";
import type { DeliveryResumeFileStore } from
  "../delivery-resume-files/types.js";
import type { SelectedFileRegistry } from
  "../files/selected-file-registry.js";
import { createDeliveryResumeFileTools } from "./delivery-resume-file-tools.js";
import { createSelectedFileTools } from "./selected-files.js";

export interface LocalFileToolDependencies {
  selectedFileRegistry?: SelectedFileRegistry;
  deliveryResumeFiles?: DeliveryResumeFileStore;
  browserPageOperator?: BrowserPageOperator;
}

export function createLocalFileTools(
  dependencies: LocalFileToolDependencies,
): AgentTool[] {
  return [
    ...(dependencies.selectedFileRegistry
      ? createSelectedFileTools(dependencies.selectedFileRegistry)
      : []),
    ...(dependencies.deliveryResumeFiles
      ? createDeliveryResumeFileTools(
          dependencies.deliveryResumeFiles,
          dependencies.browserPageOperator,
          dependencies.selectedFileRegistry,
        )
      : []),
  ];
}
