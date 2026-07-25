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

/**
 * B3: 可操作元素的稳定摘要。tagElements 注入 data-fill-id 后返回，
 * 写原语通过 fillId 定位元素。label/placeholder/currentValue 是不可信数据。
 */
export interface FormElementSummary {
  fillId: string;
  elementType: "input" | "textarea" | "select" | "button" | "a" | "other";
  inputType?: string;
  label: string;
  placeholder: string;
  required: boolean;
  currentValue?: string;
}

/**
 * B3: 写权限闸门授予/收回结果。message 用于返回给 Agent 的解释文本。
 */
export type WriteAccessCheck =
  | { ok: true }
  | { ok: false; message: string };

/**
 * B3: 页面操作能力。BrowserWindowManager 实现，供 browser_* 写工具消费。
 * 写原语受主进程写权限闸门约束，未授予时以 isError 文本形式告知 Agent。
 * 页面 DOM 内容（label/文本）视为不可信数据。
 */
export interface BrowserPageOperator {
  /** 主进程 write-enable 标志位查询；工具执行前均检查此位。 */
  isWriteAccessGranted(): boolean;
  /**
   * 由 approval executor 在用户确认后调用；绑定当前活跃标签 + origin，
   * 空闲超时或导航到新 origin 时自动收回。
   */
  grantWriteAccess(reason: string): void;
  revokeWriteAccess(cause: string): void;
  /** 写原语调用前统一检查；返回 { ok:false, message } 时应作为 isError 返回。 */
  checkWriteAccess(): WriteAccessCheck;

  tagElements(): Promise<FormElementSummary[]>;
  fillField(fillId: string, value: string): Promise<void>;
  selectOption(fillId: string, value: string): Promise<void>;
  setChecked(fillId: string, checked: boolean): Promise<void>;
  clickElement(fillId: string): Promise<void>;
  scrollTo(fillId: string): Promise<void>;
}
