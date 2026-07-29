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
      <span>公司</span>
      <input v-model="model.companyName" maxlength="240" required />
    </label>
    <label>
      <span>岗位</span>
      <input v-model="model.roleName" maxlength="240" required />
    </label>
    <label>
      <span>投递时间</span>
      <input v-model="model.appliedAt" type="datetime-local" required />
    </label>
    <label>
      <span>投递方式</span>
      <select v-model="model.deliveryMethod">
        <option value="manual">手动记录</option>
        <option value="form_fill">网页表单</option>
        <option value="email_fill">邮件投递</option>
        <option value="other">其他方式</option>
      </select>
    </label>
    <label>
      <span>关联 JD</span>
      <select v-model="model.jdId" :required="requireReferences">
        <option value="">{{ requireReferences ? '请选择 JD' : '不关联' }}</option>
        <option v-for="item in references.jds" :key="item.id" :value="item.id">
          {{ item.title }}
        </option>
      </select>
    </label>
    <label>
      <span>投递简历</span>
      <select v-model="model.resumeId" :required="requireReferences">
        <option value="">{{ requireReferences ? '请选择实际投递 Resume' : '不关联' }}</option>
        <option v-for="item in references.resumes" :key="item.id" :value="item.id">
          {{ item.title }}
        </option>
      </select>
    </label>
    <label class="tracker-form-wide">
      <span>岗位链接</span>
      <input
        v-model="model.targetUrl"
        type="url"
        maxlength="4096"
        placeholder="https://"
      />
    </label>
  </div>

  <details class="tracker-form-more">
    <summary>补充信息</summary>
    <div class="tracker-form-stack">
      <label>
        <span>公司业务</span>
        <textarea v-model="model.companyBusiness" rows="2" maxlength="20000" />
      </label>
      <label>
        <span>岗位摘要</span>
        <textarea v-model="model.roleSummary" rows="2" maxlength="20000" />
      </label>
      <label>
        <span>公司文化</span>
        <textarea v-model="model.companyCulture" rows="2" maxlength="20000" />
      </label>
      <label v-if="includeRejectionReason">
        <span>拒绝原因</span>
        <textarea v-model="model.rejectionReason" rows="2" maxlength="20000" />
      </label>
    </div>
  </details>
</template>
