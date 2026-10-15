import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const VALID_STATUSES = new Set([
  "not_determined", "restricted", "denied", "write_only",
  "full_access", "unavailable",
]);

export function verifyNativeCalendarRuntime(bindingPath) {
  if (process.platform !== "darwin") return { skipped: "not macOS" };
  const resolved = resolve(bindingPath);
  const architectures = run("lipo", ["-archs", resolved]).trim().split(/\s+/u);
  for (const architecture of architectures) {
    const undefinedSymbols = run("nm", ["-u", "-arch", architecture, resolved]);
    if (undefinedSymbols.includes("___isPlatformVersionAtLeast")) {
      throw new Error(
        `Calendar bridge leaves __isPlatformVersionAtLeast unresolved (${architecture})`,
      );
    }
  }

  const hostArchitecture = process.arch === "x64" ? "x86_64" : process.arch;
  if (!architectures.includes(hostArchitecture)) {
    return { architectures, runtime: "skipped for host architecture" };
  }
  const smoke = spawnSync(process.execPath, [
    "-e",
    "const b=require(process.argv[1]);const s=b.calendarAuthorizationStatus();" +
      "if(!process.argv[2].split(',').includes(s))throw new Error(`bad status: ${s}`);" +
      "process.stdout.write(s)",
    resolved,
    [...VALID_STATUSES].join(","),
  ], { encoding: "utf8" });
  if (smoke.status !== 0) {
    throw new Error(
      `Calendar native smoke failed (${smoke.signal ?? smoke.status}): ` +
      `${smoke.stderr || smoke.stdout}`,
    );
  }
  return { architectures, status: smoke.stdout };
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) {
    throw new Error("Usage: verify-native-calendar-runtime <binding-path>");
  }
  process.stdout.write(`${JSON.stringify(
    verifyNativeCalendarRuntime(process.argv[2]), null, 2,
  )}\n`);
}
