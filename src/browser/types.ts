export interface PageFormField {
  label: string;
  name: string;
  inputType: string;
  placeholder: string;
  required: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  text: string;
  textTruncated: boolean;
  formFields: PageFormField[];
}

/**
 * B2: 只读读取当前浏览器活跃标签页内容的能力。
 * 由浏览器子系统（BrowserWindowManager）实现，供 extract_page 工具消费。
 * 只暴露读能力，收窄工具能力面，保持与浏览器子系统解耦。
 */
export interface BrowserPageReader {
  readActivePage(): Promise<PageSnapshot>;
}
