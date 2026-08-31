import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Browser secondary text meets WCAG AA in both themes", async () => {
  const css = await readFile(new URL(
    "../src/desktop/renderer/src/styles/tokens.css", import.meta.url,
  ), "utf8");
  const roots = [...css.matchAll(/:root(?:\.dark)?\s*\{([^}]+)\}/gu)]
    .map((match) => match[1] ?? "");
  assert.equal(roots.length, 2);
  for (const root of roots) {
    const foreground = cssVariable(root, "browser-secondary-text");
    const background = cssVariable(root, "surface-strong");
    assert.ok(contrastRatio(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet 4.5:1`);
  }
});

function cssVariable(block: string, name: string): string {
  const value = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "iu").exec(block)?.[1];
  assert.ok(value, `missing --${name}`);
  return value;
}

function contrastRatio(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045
      ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
