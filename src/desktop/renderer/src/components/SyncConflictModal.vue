<template>
  <div class="conflict-backdrop" @click.self="$emit('cancel')">
    <div class="conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <h2 id="conflict-title" class="conflict-title">简历冲突</h2>
      <p class="conflict-desc">
        "{{ title }}"的云端版本和本地草稿在上次同步后都发生了修改。请选择处理方式：
      </p>

      <div class="conflict-actions">
        <button class="conflict-btn" @click="$emit('reload')">
          <strong>重读云端</strong>
          <span>放弃本地修改，以当前云端内容为准</span>
        </button>

        <button class="conflict-btn" @click="$emit('saveAsNew')">
          <strong>另存为新简历</strong>
          <span>将本地草稿保存为一份新的云端简历，不影响原版本</span>
        </button>

        <button class="conflict-btn destructive" @click="confirmOverwrite">
          <strong>覆盖云端</strong>
          <span>用本地草稿替换云端当前内容，此操作不可撤销</span>
        </button>
      </div>

      <button class="conflict-cancel-btn" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();

const emit = defineEmits<{
  reload: [];
  saveAsNew: [];
  overwrite: [];
  cancel: [];
}>();

function confirmOverwrite() {
  if (confirm("确认用本地草稿覆盖云端当前内容？此操作不可撤销。")) {
    emit("overwrite");
  }
}
</script>
