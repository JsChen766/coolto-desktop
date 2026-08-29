import type { DeliveryResumeFile, JobRepositoryJd } from "@desktop/types";
import { desktopErrorMessage } from "../chat/desktop-error-message";
import { desktopApi } from "../lib/desktop-api";

export function useDeliveryResumeActions(input: {
  openFile(fileId: string): void;
  createChat(): Promise<void>;
  send(text: string): Promise<void>;
  setError(message: string): void;
}) {
  async function importDeliveryResumeFile(): Promise<void> {
    try {
      const file = await desktopApi.deliveryResumeFiles.importFile();
      if (file) input.openFile(file.id);
    } catch (error: unknown) {
      input.setError(desktopErrorMessage(error));
    }
  }

  async function startDeliveryResumeFile(
    file: DeliveryResumeFile,
    jd?: JobRepositoryJd,
  ): Promise<void> {
    try {
      await desktopApi.deliveryResumeFiles.select({ fileId: file.id });
      await input.createChat();
      const target = jd ? `岗位“${jd.title}”` : "下一次岗位投递";
      await input.send(
        `请使用我的用户源文件《${file.title}》进行${target}。这份文件可用于任何岗位；` +
        "不要判断相关性，也不要生成、修改或复用其他简历。",
      );
    } catch (error: unknown) {
      input.setError(desktopErrorMessage(error));
    }
  }

  return { importDeliveryResumeFile, startDeliveryResumeFile };
}
