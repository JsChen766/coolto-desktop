export function canUseNativeEventKit(
  platform: string,
  runningUnderARM64Translation: boolean,
): boolean {
  return platform === "darwin" && !runningUnderARM64Translation;
}
