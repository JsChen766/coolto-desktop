const MATERIAL_BOUNDARY_TOOLS = new Set([
  "create_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
  "pause_resume_for_material",
  "get_resume_workspace",
]);

/** A successful workspace result may create one host-owned user boundary. */
export function crossedResumeMaterialBoundary(
  results: readonly { toolName: string; isError?: boolean }[],
): boolean {
  return results.some((result) =>
    !result.isError && MATERIAL_BOUNDARY_TOOLS.has(result.toolName)
  );
}
