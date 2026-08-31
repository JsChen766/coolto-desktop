const MATERIAL_MARKER = /^【材料指纹：[0-9a-f]{64}】$/u;

export function stripMaterialMarkers(content: string): string {
  return content.split("\n")
    .filter((line) => !MATERIAL_MARKER.test(line.trim()))
    .join("\n")
    .trimEnd();
}
