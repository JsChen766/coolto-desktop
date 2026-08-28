import type { TailLengthBudget } from "./tail-length-budget.js";
import { factNeutralRewriteVariants } from
  "./fact-neutral-rewrite-variants.js";

export function factNeutralRewriteOptions(input: {
  bulletId: string;
  currentText: string;
  language: string;
  budget?: TailLengthBudget;
}): string[] {
  return factNeutralRewriteOptionPool(input).slice(0, 2);
}

export function factNeutralRewriteOptionPool(input: {
  bulletId: string;
  currentText: string;
  language: string;
  budget?: TailLengthBudget;
}): string[] {
  const target = input.budget?.idealGrowthCjk ?? 12;
  const variants = factNeutralRewriteVariants(
    input.currentText,
    input.language,
    hash(input.bulletId),
  );
  const entries = variants.map((variant, index) => {
    const growth = visualUnits(variant.text) - visualUnits(input.currentText);
    return {
      ...variant,
      index,
      distance: Math.abs(growth - target),
      inBudget: input.budget
        ? growth >= input.budget.minimumGrowthCjk &&
          growth <= input.budget.maximumGrowthCjk
        : false,
    };
  }).filter((entry, index, values) =>
    entry.text !== input.currentText &&
    values.findIndex((candidate) => candidate.text === entry.text) === index
  );
  const inBudget = entries.filter((entry) => entry.inBudget);
  const ranks = rotatedRanks(inBudget.length ? inBudget : entries, input.bulletId);
  return entries.sort((left, right) => {
    const band = Number(right.inBudget) - Number(left.inBudget);
    if (band) return band;
    if (inBudget.length && left.inBudget === right.inBudget) {
      const placement = left.placementRank - right.placementRank;
      if (placement) return placement;
      const distanceBand = Math.floor(left.distance / 3) -
        Math.floor(right.distance / 3);
      if (distanceBand) return distanceBand;
      const rotated = (ranks.get(left.index) ?? 0) -
        (ranks.get(right.index) ?? 0);
      if (rotated) return rotated;
    }
    return left.distance - right.distance ||
      left.placementRank - right.placementRank ||
      left.index - right.index;
  }).map(({ text }) => text);
}

export function nextFactNeutralRewriteOptions(input: {
  bulletId: string;
  currentText: string;
  language: string;
  budget?: TailLengthBudget;
  rejected: readonly string[];
}): string[] {
  const pool = factNeutralRewriteOptionPool(input);
  const rejected = new Set(input.rejected);
  const fresh = pool.filter((candidate) => !rejected.has(candidate));
  return (fresh.length ? fresh : pool).slice(0, 2);
}

function rotatedRanks<T extends { index: number }>(
  entries: readonly T[],
  bulletId: string,
): Map<number, number> {
  if (!entries.length) return new Map();
  const offset = hash(bulletId) % entries.length;
  return new Map(entries.map((entry, index) => [
    entry.index,
    (index - offset + entries.length) % entries.length,
  ]));
}

function visualUnits(value: string): number {
  return [...value].reduce((total, character) =>
    total + (/\p{Script=Han}/u.test(character)
      ? 1 : /\s/u.test(character) ? 0.25 : 0.5), 0);
}

function hash(value: string): number {
  return [...value].reduce((total, character) =>
    (total * 31 + (character.codePointAt(0) ?? 0)) >>> 0, 0);
}
