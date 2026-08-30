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
  elementType:
    | "input"
    | "textarea"
    | "select"
    | "button"
    | "a"
    | "contenteditable"
    | "other";
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
 * B4: 每一次成功的写原语记录。fillLog 用于 Overlay 审核阶段
 * 逐项展示给用户以及全部拒绝时还原原值。click/scroll 不入 log。
 */
export interface BrowserFieldWriteRecord {
  fillId: string;
  label: string;
  elementType:
    | "input"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio"
    | "contenteditable";
  valueBefore: string;
  valueAfter: string;
  writtenAt: string;
}

/**
 * B5: 文件上传结果。cancelled = 用户在系统文件选择框点了取消（非错误）。
 * uploaded 时携带选中的文件名（展示用）与实际注入的文件数。
 */
export type FileUploadOutcome =
  | { cancelled: true }
  | { cancelled: false; filenames: string[]; fileCount: number };

/** B4: Overlay 逐字段决策。pending = 尚未处理；accepted/rejected 由用户点击产生。 */
export type FieldReviewDecision = "pending" | "accepted" | "rejected";

/** B4: Overlay 结束时的最终结果，供渲染进程呈现「已接受 X / 已拒绝 Y」。 */
export interface ReviewOutcome {
  action: "accepted" | "rejected" | "mixed";
  acceptedCount: number;
  rejectedCount: number;
}

/** B4: 验证码/滑块检测特征。命中则通知 Agent 暂停并提示用户手动通过。 */
export interface CaptchaDetection {
  kind: "recaptcha" | "hcaptcha" | "geetest" | "slider" | "image" | "unknown";
  detail?: string;
}

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
  /**
   * B5: 向原生 `<input type=file>` 上传本地文件。弹出系统文件选择框让用户
   * 手动选取（Agent 不能自行指定任意本地路径），选中后经 CDP 注入。
   * 用户取消选择时返回 { cancelled: true }，不视为错误。
   */
  uploadFile(
    fillId: string,
    registeredPaths?: readonly string[],
  ): Promise<FileUploadOutcome>;

  /**
   * B4: 审核阶段控制。enterReview 前 fillLog 必须非空；进入后 gate 转为
   * reviewing，任何新的写原语调用返回 isError；exitReview 清空 fillLog 与
   * reviewing 标志。isReviewing/getFillLog 供主进程编排 Overlay 使用。
   */
  isReviewing(): boolean;
  getFillLog(): BrowserFieldWriteRecord[];
  enterReview(): void;
  exitReview(): void;
}
