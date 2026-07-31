<script setup lang="ts">
import { FilePlus2, Pencil, Trash2 } from "@lucide/vue";
import type { ApplicationNote, ApplicationRecord, ApplicationStatusEvent, InterviewRound } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import { NOTE_TYPE_LABELS } from "../tracker/tracker-child-labels";
import { statusHistoryConsistent } from "../../../../tracker/status-history";
import { localeCode, translate, translateFormat } from "../i18n/locale";

defineProps<{ application: ApplicationRecord; events: ApplicationStatusEvent[]; notes: ApplicationNote[]; interviews: InterviewRound[]; busy?: boolean }>();
defineEmits<{ addNote: []; editNote: [value: ApplicationNote]; removeNote: [id: string] }>();
function time(value: string): string { return new Date(value).toLocaleString(localeCode()); }
function roundLabel(id: string | null, interviews: InterviewRound[]): string | null {
  if (!id) return null;
  const found = interviews.find((item) => item.id === id);
  return found
    ? translateFormat("第 {round} 轮面试", { round: found.roundNumber })
    : translate("关联面试已删除");
}
</script>

<template>
  <div class="tracker-child-sections">
    <section class="tracker-child-section tracker-status-history">
      <header><div><strong>{{ $t('状态历史') }}</strong><span>{{ events.length }}</span></div></header>
      <ol>
        <li class="baseline"><i /><div><strong>{{ $t('记录投递') }} · {{ STATUS_LABELS.applied }}</strong><time :datetime="application.appliedAt ?? application.createdAt">{{ time(application.appliedAt ?? application.createdAt) }}</time></div></li>
        <li v-for="event in events" :key="event.id"><i /><div><strong>{{ event.fromStatus ? STATUS_LABELS[event.fromStatus] : $t('初始状态') }} → {{ STATUS_LABELS[event.toStatus] }}</strong><time :datetime="event.occurredAt">{{ time(event.occurredAt) }}</time><p v-if="event.reason">{{ event.reason }}</p></div></li>
        <li v-if="application.syncStatus === 'pending'" class="pending"><i /><div><strong>{{ $t('本机状态待同步') }} · {{ STATUS_LABELS[application.status] }}</strong><time :datetime="application.updatedAt">{{ time(application.updatedAt) }}</time></div></li>
      </ol>
      <p v-if="!statusHistoryConsistent(application, events)" class="tracker-history-warning" role="alert">{{ $t('当前状态与服务端历史暂不一致，请刷新同步后再操作。') }}</p>
    </section>
    <section class="tracker-child-section">
      <header><div><strong>{{ $t('笔记') }}</strong><span>{{ notes.length }}</span></div><button type="button" :disabled="busy" @click="$emit('addNote')"><FilePlus2 :size="14" />{{ $t('添加笔记') }}</button></header>
      <div v-if="notes.length" class="tracker-note-list">
        <article v-for="note in notes" :key="note.id"><header><div><strong>{{ NOTE_TYPE_LABELS[note.noteType] }}</strong><span v-if="roundLabel(note.interviewRoundId, interviews)">{{ roundLabel(note.interviewRoundId, interviews) }}</span><time :datetime="note.updatedAt">{{ time(note.updatedAt) }}</time></div><nav><button type="button" :aria-label="$t('修改笔记')" @click="$emit('editNote', note)"><Pencil :size="14" /></button><button type="button" :aria-label="$t('删除笔记')" @click="$emit('removeNote', note.id)"><Trash2 :size="14" /></button></nav></header><p>{{ note.content }}</p></article>
      </div>
      <p v-else class="tracker-child-empty">{{ $t('尚未添加笔记。') }}</p>
    </section>
  </div>
</template>
