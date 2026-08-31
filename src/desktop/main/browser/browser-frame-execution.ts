import type { WebContents, WebFrameMain } from "electron";

export interface FrameExecution<T> {
  framePath: string[];
  value: T;
}

export async function executeInSameOriginFrames<T>(
  contents: WebContents,
  script: string,
): Promise<FrameExecution<T>[]> {
  const main = contents.mainFrame;
  if (!main) {
    return [{ framePath: [], value: await contents.executeJavaScript(script, true) as T }];
  }
  const frames = [
    main,
    ...main.framesInSubtree.filter((frame) => frame !== main &&
      !frame.isDestroyed() && frame.origin === main.origin),
  ];
  const results: FrameExecution<T>[] = [];
  for (const frame of frames) {
    try {
      results.push({
        framePath: frame === main ? [] : [frameLabel(frame)],
        value: await frame.executeJavaScript(script, true) as T,
      });
    } catch {
      if (frame === main) throw new Error("主页面语义脚本执行失败");
    }
  }
  return results;
}

function frameLabel(frame: WebFrameMain): string {
  return `${frame.origin}#${frame.frameTreeNodeId}`;
}
