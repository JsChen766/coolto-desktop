import { ConversationSelectedFiles } from "./conversation-selected-files.js";
import { createElectronDeliveryResumeFiles } from "./delivery-resume-files/electron-delivery-resume-files.js";

export function createUserFileServices(apiBaseUrl: string, ownerId: string) {
  return {
    selectedFiles: new ConversationSelectedFiles(),
    deliveryResumeFiles: createElectronDeliveryResumeFiles(apiBaseUrl, ownerId),
  };
}

export type UserFileServices = ReturnType<typeof createUserFileServices>;
