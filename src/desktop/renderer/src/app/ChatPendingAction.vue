<script setup lang="ts">
import type { DesktopApprovalDecision, DesktopApprovalRequest } from "@desktop/types";
import ApprovalCard from "../components/ApprovalCard.vue";
import DelegationPanel from "../agent-tasks/DelegationPanel.vue";
import ResumeStrategyChoiceCard from
  "../components/ResumeStrategyChoiceCard.vue";

defineProps<{ request: DesktopApprovalRequest; busy: boolean }>();
defineEmits<{ decide: [decision: DesktopApprovalDecision] }>();
</script>

<template>
  <DelegationPanel
    v-if="request.actionType === 'agent_task.provision'"
    :request="request"
    :busy="busy"
    @decide="$emit('decide', $event)"
  />
  <ResumeStrategyChoiceCard
    v-else-if="request.actionType === 'resume.strategy.choose'"
    :request="request"
    :busy="busy"
    @decide="$emit('decide', $event)"
  />
  <ApprovalCard
    v-else
    :request="request"
    :busy="busy"
    @decide="$emit('decide', $event)"
  />
</template>
