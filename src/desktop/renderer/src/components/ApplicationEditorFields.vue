<script setup lang="ts">
import { computed } from "vue";
import type { ApplicationReferenceOptions } from "@desktop/types";
import type { ApplicationFormModel } from "../tracker/application-form";
import DialogSelect from "./DialogSelect.vue";
import type { DialogSelectOption } from "./dialog-select-types";
import { translate } from "../i18n/locale";

const props = defineProps<{
  references: ApplicationReferenceOptions;
  includeRejectionReason?: boolean;
  requireReferences?: boolean;
}>();

const model = defineModel<ApplicationFormModel>({ required: true });

const deliveryMethodOptions: DialogSelectOption[] = [
  { value: "manual", label: translate("手动记录") },
  { value: "form_fill", label: translate("网页表单") },
  { value: "email_fill", label: translate("邮件投递") },
  { value: "other", label: translate("其他方式") },
];

const jdOptions = computed<DialogSelectOption[]>(() => [
  { value: "", label: translate(props.requireReferences ? "请选择 JD" : "不关联") },
  ...props.references.jds.map((item) => ({ value: item.id, label: item.title })),
]);

const resumeOptions = computed<DialogSelectOption[]>(() => [
  { value: "", label: translate(props.requireReferences ? "请选择实际投递 Resume" : "不关联") },
  ...props.references.resumes.map((item) => ({ value: item.id, label: item.title })),
]);
</script>

<template>
  <div class="tracker-form-grid">
    <label>
      <span>{{ $t('公司') }}</span>
      <input v-model="model.companyName" maxlength="240" required />
    </label>
    <label>
      <span>{{ $t('岗位') }}</span>
      <input v-model="model.roleName" maxlength="240" required />
    </label>
    <label>
      <span>{{ $t('投递时间') }}</span>
      <input v-model="model.appliedAt" type="datetime-local" required />
    </label>
    <label>
      <span>{{ $t('投递方式') }}</span>
      <DialogSelect v-model="model.deliveryMethod" :options="deliveryMethodOptions" />
    </label>
    <label>
      <span>{{ $t('关联 JD') }}</span>
      <DialogSelect v-model="model.jdId" :options="jdOptions" />
    </label>
    <label>
      <span>{{ $t('投递简历') }}</span>
      <DialogSelect v-model="model.resumeId" :options="resumeOptions" />
    </label>
    <label class="tracker-form-wide">
      <span>{{ $t('岗位链接') }}</span>
      <input
        v-model="model.targetUrl"
        type="url"
        maxlength="4096"
        placeholder="https://"
      />
    </label>
  </div>

  <details class="tracker-form-more">
    <summary>{{ $t('补充信息') }}</summary>
    <div class="tracker-form-stack">
      <label>
        <span>{{ $t('公司业务') }}</span>
        <textarea v-model="model.companyBusiness" rows="2" maxlength="20000" />
      </label>
      <label>
        <span>{{ $t('岗位摘要') }}</span>
        <textarea v-model="model.roleSummary" rows="2" maxlength="20000" />
      </label>
      <label>
        <span>{{ $t('公司文化') }}</span>
        <textarea v-model="model.companyCulture" rows="2" maxlength="20000" />
      </label>
      <label v-if="includeRejectionReason">
        <span>{{ $t('拒绝原因') }}</span>
        <textarea v-model="model.rejectionReason" rows="2" maxlength="20000" />
      </label>
    </div>
  </details>
</template>
