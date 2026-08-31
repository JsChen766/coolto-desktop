import type { ResumeChatReference } from "@desktop/types";
import type { AttachmentView } from "../attachments/use-conversation-attachment";

export interface ComposerProps {
  disabled?: boolean;
  running?: boolean;
  attachment?: AttachmentView | undefined;
  attachmentBusy?: boolean;
  attachmentError?: string | undefined;
  resumeContext?: ResumeChatReference | undefined;
  cloudCopyRequested?: boolean;
  guided?: boolean;
  guidedText?: string | undefined;
  guidedHighlight?: boolean;
}
