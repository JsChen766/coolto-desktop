import { protectedBulletSimilarity } from "./protected-core.js";

const NORMALIZE_PUNCTUATION = /[^\p{L}\p{N}]+/gu;

export function normalizedBulletText(text: string): string {
  return text.toLocaleLowerCase().replace(NORMALIZE_PUNCTUATION, "");
}

export function bulletSimilarity(left: string, right: string): number {
  return protectedBulletSimilarity(left, right, javascriptBulletSimilarity);
}

function javascriptBulletSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizedBulletText(left);
  const normalizedRight = normalizedBulletText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  const leftGrams = ngrams(normalizedLeft, 3);
  const rightGrams = ngrams(normalizedRight, 3);
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;
  return union ? intersection / union : 0;
}

export function findNearDuplicatePairs(
  bullets: readonly { id: string; text: string }[],
  threshold = 0.72,
): Array<{ bulletIds: [string, string]; similarity: number }> {
  const pairs: Array<{ bulletIds: [string, string]; similarity: number }> = [];
  for (let left = 0; left < bullets.length; left += 1) {
    for (let right = left + 1; right < bullets.length; right += 1) {
      const first = bullets[left]!;
      const second = bullets[right]!;
      const similarity = bulletSimilarity(first.text, second.text);
      if (similarity >= threshold) {
        pairs.push({
          bulletIds: [first.id, second.id],
          similarity: Number(similarity.toFixed(4)),
        });
      }
    }
  }
  return pairs;
}

function ngrams(value: string, size: number): Set<string> {
  if (value.length <= size) return new Set([value]);
  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}
