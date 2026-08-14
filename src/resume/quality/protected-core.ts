export interface ProtectedQualityCore {
  weightedQualityScore(
    weightedJdCoverage: number,
    mustHaveCoverage: number,
    evidenceSpecificity: number,
    informationDiversity: number,
  ): number;
  bulletSimilarity(left: string, right: string): number;
}

let installedCore: ProtectedQualityCore | undefined;

export function installProtectedQualityCore(core: ProtectedQualityCore): void {
  installedCore = core;
}

export function protectedQualityScore(
  weightedJdCoverage: number,
  mustHaveCoverage: number,
  evidenceSpecificity: number,
  informationDiversity: number,
): number {
  return installedCore
    ? installedCore.weightedQualityScore(
        weightedJdCoverage,
        mustHaveCoverage,
        evidenceSpecificity,
        informationDiversity,
      )
    : round(
        weightedJdCoverage * 0.35 +
          mustHaveCoverage * 0.3 +
          evidenceSpecificity * 0.15 +
          informationDiversity * 0.2,
      );
}

export function protectedBulletSimilarity(
  left: string,
  right: string,
  fallback: (left: string, right: string) => number,
): number {
  return installedCore?.bulletSimilarity(left, right) ?? fallback(left, right);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
