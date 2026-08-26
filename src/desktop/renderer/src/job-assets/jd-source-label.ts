import type { JdSourceKind } from "../../../../jd/source.js";
import { translate } from "../i18n/locale.js";

export function jdSourceLabel(kind: JdSourceKind): string {
  if (kind === "browser") return translate("浏览器页面");
  if (kind === "imported") return translate("文件导入");
  if (kind === "pasted") return translate("粘贴内容");
  return translate("手动录入");
}
