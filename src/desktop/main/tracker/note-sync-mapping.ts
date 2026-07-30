import type { ApplicationNote, NoteInput } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import { childBase, enumValue, nullableString } from "./tracker-mapping-utils.js";

const TYPES = ["general", "interview", "follow_up", "company"] as const;

export function toNote(entity: LocalEntity): ApplicationNote {
  return {
    ...childBase(entity),
    interviewRoundId: nullableString(entity.payload.interviewRoundId, "note.interviewRoundId"),
    noteType: enumValue(entity.payload.noteType, TYPES, "note.noteType"),
    content: typeof entity.payload.content === "string" ? entity.payload.content : malformed(),
  };
}

export function noteWritePayload(applicationId: string, input: NoteInput) {
  const content = input.content.trim();
  if (!TYPES.includes(input.noteType)) throw new Error("笔记类型无效");
  if (!content || [...content].length > 50_000) throw new Error("笔记正文应为 1–50000 字");
  return {
    applicationId, interviewRoundId: input.interviewRoundId?.trim() || null,
    noteType: input.noteType, content,
  };
}

export function localNote(
  id: string, applicationId: string, input: NoteInput, now: string,
  previous?: ApplicationNote,
): Record<string, unknown> {
  return {
    id, ...noteWritePayload(applicationId, input), entityVersion: previous?.entityVersion ?? 1,
    createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
}

function malformed(): never {
  throw new Error("Malformed note.content");
}

