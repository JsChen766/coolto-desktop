import type {
  ExperienceDetail,
  ExperienceSearchOptions,
} from "../../../api/types.js";

export function filterExperiences(
  all: ExperienceDetail[],
  options: ExperienceSearchOptions,
): { items: ExperienceDetail[]; nextCursor: string | null } {
  const query = normalize(options.q ?? "");
  const wantedTags = (options.tags ?? []).map(normalize).filter(Boolean);
  const status = options.status ?? "active";
  const filtered = all.filter((experience) => {
    if (experience.status !== status) return false;
    if (options.category && experience.category !== options.category) return false;
    if (query && !searchText(experience).includes(query)) return false;
    const tags = new Set(experience.tags.map(normalize));
    return wantedTags.every((tag) => tags.has(tag));
  });
  const sorted = filtered.sort(compareByUpdatedThenId);
  const start = decodeCursor(options.cursor, sorted);
  const limit = clampLimit(options.limit);
  const page = sorted.slice(start, start + limit);
  const nextCursor = start + limit < sorted.length
    ? encodeCursor(page[page.length - 1])
    : null;
  return { items: page, nextCursor };
}

function searchText(experience: ExperienceDetail): string {
  return [
    experience.title,
    experience.organization,
    experience.role,
    experience.location,
    ...experience.tags,
    experience.currentRevision?.content,
  ].filter((value): value is string => typeof value === "string")
    .map(normalize)
    .join(" ");
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function compareByUpdatedThenId(a: ExperienceDetail, b: ExperienceDetail): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return 100;
  return Math.min(limit, 500);
}

function encodeCursor(experience: ExperienceDetail | undefined): string | null {
  if (!experience) return null;
  return Buffer.from(
    `${experience.updatedAt}\u0000${experience.id}`,
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
  sorted: ExperienceDetail[],
): number {
  if (!cursor) return 0;
  const [updatedAt, id] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split("\u0000");
  const index = sorted.findIndex(
    (experience) => experience.updatedAt === updatedAt && experience.id === id,
  );
  return index < 0 ? sorted.length : index + 1;
}
