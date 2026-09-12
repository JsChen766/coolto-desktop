<script setup lang="ts">
import type {
  DesktopApi,
  PrivacyDeletionState,
  PrivacyGateState,
} from "@desktop/types";
import { ref } from "vue";
import AccountDeletionDialog from "./AccountDeletionDialog.vue";
import DataExportDialog from "./DataExportDialog.vue";
import PrivacyConsentDialog from "./PrivacyConsentDialog.vue";
defineProps<{
  api: DesktopApi;
  gateOpen: boolean;
  recoveryOpen: boolean;
  state: PrivacyGateState | undefined;
  deletionState?: PrivacyDeletionState;
  busy: boolean;
  error: string | undefined;
  authenticated: boolean;
}>();
const emit = defineEmits<{
  agree: [];
  decline: [];
  logout: [];
}>();
const localExportOpen = ref(false);
</script>

<template>
  <AccountDeletionDialog
    v-if="recoveryOpen"
    :api="api"
    :standalone="true"
    @logout="emit('logout')"
  />
  <PrivacyConsentDialog
    v-else-if="gateOpen"
    :state="state"
    :busy="busy"
    :error="error"
    :authenticated="authenticated"
    @agree="emit('agree')"
    @decline="emit('decline')"
    @logout="emit('logout')"
    @export-local="localExportOpen = true"
  />
  <DataExportDialog
    v-if="localExportOpen"
    :api="api"
    :local-only="true"
    @close="localExportOpen = false"
  />
</template>
