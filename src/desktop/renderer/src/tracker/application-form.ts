import type {
  ApplicationCreateInput,
  ApplicationRecord,
  ApplicationUpdateInput,
} from "../../../shared/types.js";

export interface ApplicationFormModel {
  companyName: string;
  roleName: string;
  appliedAt: string;
  deliveryMethod: ApplicationCreateInput["deliveryMethod"];
  targetUrl: string;
  jdId: string;
  resumeId: string;
  companyBusiness: string;
  roleSummary: string;
  companyCulture: string;
  rejectionReason: string;
}

export function emptyApplicationForm(): ApplicationFormModel {
  return {
    companyName: "",
    roleName: "",
    appliedAt: localDateTime(new Date().toISOString()),
    deliveryMethod: "manual",
    targetUrl: "",
    jdId: "",
    resumeId: "",
    companyBusiness: "",
    roleSummary: "",
    companyCulture: "",
    rejectionReason: "",
  };
}

export function applicationFormOf(value: ApplicationRecord): ApplicationFormModel {
  return {
    companyName: value.companyName,
    roleName: value.roleName,
    appliedAt: value.appliedAt ? localDateTime(value.appliedAt) : "",
    deliveryMethod: value.deliveryMethod,
    targetUrl: value.targetUrl ?? "",
    jdId: value.jdId ?? "",
    resumeId: value.resumeId ?? "",
    companyBusiness: value.companyBusiness ?? "",
    roleSummary: value.roleSummary ?? "",
    companyCulture: value.companyCulture ?? "",
    rejectionReason: value.rejectionReason ?? "",
  };
}

export function toCreateInput(value: ApplicationFormModel): ApplicationCreateInput {
  return {
    companyName: value.companyName.trim(),
    roleName: value.roleName.trim(),
    appliedAt: iso(value.appliedAt),
    deliveryMethod: value.deliveryMethod,
    targetUrl: optional(value.targetUrl),
    jdId: optional(value.jdId),
    resumeId: optional(value.resumeId),
    companyBusiness: optional(value.companyBusiness),
    roleSummary: optional(value.roleSummary),
    companyCulture: optional(value.companyCulture),
    pendingConfirmation: false,
    source: "manual",
  };
}

export function toUpdateInput(value: ApplicationFormModel): ApplicationUpdateInput {
  return {
    jdId: optional(value.jdId),
    resumeId: optional(value.resumeId),
    companyName: value.companyName.trim(),
    roleName: value.roleName.trim(),
    deliveryMethod: value.deliveryMethod,
    targetUrl: optional(value.targetUrl),
    appliedAt: iso(value.appliedAt),
    pendingConfirmation: false,
    companyBusiness: optional(value.companyBusiness),
    roleSummary: optional(value.roleSummary),
    companyCulture: optional(value.companyCulture),
    rejectionReason: optional(value.rejectionReason),
  };
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function iso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function localDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
