import type { MatchReport } from "./types.js";

export interface MatchReportEntry {
  report: MatchReport;
  jdTitle: string;
  jdCompany: string | null;
}

export class MatchReportNotFoundError extends Error {
  constructor(id: string) {
    super(`MatchReport not found: ${id}`);
  }
}

export class MatchReportStore {
  readonly #entries: Map<string, MatchReportEntry> = new Map();
  #latestId: string | undefined;

  add(report: MatchReport, jdTitle: string, jdCompany: string | null): void {
    this.#entries.set(report.id, { report, jdTitle, jdCompany });
    this.#latestId = report.id;
  }

  getEntry(id: string): MatchReportEntry {
    const entry = this.#entries.get(id);
    if (!entry) throw new MatchReportNotFoundError(id);
    return entry;
  }

  get(id: string): MatchReport {
    return this.getEntry(id).report;
  }

  getLatest(): MatchReportEntry | undefined {
    if (!this.#latestId) return undefined;
    return this.#entries.get(this.#latestId);
  }

  listAll(): MatchReportEntry[] {
    return [...this.#entries.values()];
  }

  markExpired(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    this.#entries.set(id, {
      ...entry,
      report: { ...entry.report, expired: true },
    });
  }

  size(): number {
    return this.#entries.size;
  }
}
