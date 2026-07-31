<script setup lang="ts">
import type { ApplicationReferenceOptions } from "@desktop/types";
import type { ApplicationFormModel } from "../tracker/application-form";

defineProps<{
  references: ApplicationReferenceOptions;
  includeRejectionReason?: boolean;
  requireReferences?: boolean;
}>();

const model = defineModel<ApplicationFormModel>({ required: true });
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
      <select v-model="model.deliveryMethod">
        <option value="manual">{{ $t('手动记录') }}</option>
        <option value="form_fill">{{ $t('网页表单') }}</option>
        <option value="email_fill">{{ $t('邮件投递') }}</option>
        <option value="other">{{ $t('其他方式') }}</option>
      </select>
    </label>
    <label>
      <span>{{ $t('关联 JD') }}</span>
      <select v-model="model.jdId" :required="requireReferences">
        <option value="">{{ requireReferences ? $t('请选择 JD') : $t('不关联') }}</option>
        <option v-for="item in references.jds" :key="item.id" :value="item.id">
          {{ item.title }}
        </option>
      </select>
    </label>
    <label>
      <span>{{ $t('投递简历') }}</span>
      <select v-model="model.resumeId" :required="requireReferences">
        <option value="">{{ requireReferences ? $t('请选择实际投递 Resume') : $t('不关联') }}</option>
        <option v-for="item in references.resumes" :key="item.id" :value="item.id">
          {{ item.title }}
        </option>
      </select>
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
