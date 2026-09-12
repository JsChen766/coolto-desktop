import { type ComputedRef, type Ref, computed } from "vue";

import type { DialogSelectOption } from "../components/dialog-select-types";
import { translate } from "../i18n/locale";
import {
  PROFILE_CAREER_STAGES,
  PROFILE_LANGUAGES,
  PROFILE_RESUME_STYLES,
  isProfileCareerStage,
  isProfileLanguage,
  isProfileResumeStyle,
} from "../../../../profile/profile-defaults";
import type { ProfileFormDraft } from "./profile-form";

export function useProfileSelectOptions(
  draft: Ref<ProfileFormDraft | null | undefined>,
): {
  careerStageOptions: ComputedRef<DialogSelectOption[]>;
  languageOptions: ComputedRef<DialogSelectOption[]>;
  resumeStyleOptions: ComputedRef<DialogSelectOption[]>;
} {
  const careerStageOptions = computed<DialogSelectOption[]>(() => {
    const value = draft.value;
    if (!value) return [];
    const options: DialogSelectOption[] = [{ value: "", label: translate("未设置") }];
    if (value.careerStage && !isProfileCareerStage(value.careerStage)) {
      options.push({ value: value.careerStage, label: translate("未识别") });
    }
    for (const stage of PROFILE_CAREER_STAGES) options.push({ value: stage, label: stage });
    return options;
  });

  const languageOptions = computed<DialogSelectOption[]>(() => {
    const value = draft.value;
    if (!value) return [];
    const options: DialogSelectOption[] = [];
    if (value.preferredLanguage && !isProfileLanguage(value.preferredLanguage)) {
      options.push({ value: value.preferredLanguage, label: translate("未识别") });
    }
    for (const language of PROFILE_LANGUAGES) options.push({ value: language, label: language });
    return options;
  });

  const resumeStyleOptions = computed<DialogSelectOption[]>(() => {
    const value = draft.value;
    if (!value) return [];
    const options: DialogSelectOption[] = [];
    if (value.resumeStyle && !isProfileResumeStyle(value.resumeStyle)) {
      options.push({ value: value.resumeStyle, label: translate("未识别") });
    }
    for (const style of PROFILE_RESUME_STYLES) options.push({ value: style, label: style });
    return options;
  });

  return { careerStageOptions, languageOptions, resumeStyleOptions };
}
