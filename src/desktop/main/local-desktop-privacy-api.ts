import { PrivacyApi } from "../../api/privacy-api.js";
import { BUNDLED_PRIVACY_POLICY } from "../../privacy/policy.js";
import type { PrivacyRequester } from "../../privacy/types.js";
import { consentView } from "./privacy/privacy-state-helpers.js";

const accepted = () => consentView(BUNDLED_PRIVACY_POLICY, "accepted", new Date());

const requester: PrivacyRequester = {
  getJson: async () => BUNDLED_PRIVACY_POLICY as never,
  request: async () => accepted() as never,
  requestControl: async () => {
    throw new Error("开源 Desktop 不连接云端删除接口");
  },
  requestAckReplay: async () => {
    throw new Error("开源 Desktop 不连接云端删除接口");
  },
};

export function createLocalDesktopPrivacyApi(): PrivacyApi {
  return new PrivacyApi(requester);
}
