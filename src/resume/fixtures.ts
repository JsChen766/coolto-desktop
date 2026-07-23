import type {
  CurrentResumeStructure,
  ResumeBullet,
  ResumeSection,
  ResumeSectionItem,
} from "./types.js";

const STANDARD_PROFILE_VERSION = "resume-template-v2";
const STANDARD_PROFILE_HASH =
  "130b516b3eb2f0a5a335ff525eebd3ca43dcce1053ab02a06d384e3a18f09fc0";

function bullet(id: string, text: string): ResumeBullet {
  return {
    id,
    text,
    source_fact_ids: [`fact-${id}`],
    matched_jd_requirement_ids: [],
  };
}

function item(
  id: string,
  input: Omit<ResumeSectionItem, "id" | "source_experience_id">,
): ResumeSectionItem {
  return {
    id,
    source_experience_id: `experience-${id}`,
    ...input,
  };
}

function section(
  id: string,
  type: ResumeSection["type"],
  heading: string,
  items: ResumeSectionItem[],
): ResumeSection {
  return { id, type, heading, items };
}

function bulletList(prefix: string, texts: readonly string[]): ResumeBullet[] {
  return texts.map((text, index) => bullet(`${prefix}-${index + 1}`, text));
}

function baseStructure(
  language: string,
  sections: ResumeSection[],
): CurrentResumeStructure {
  return {
    language,
    contact: {
      name: language.startsWith("zh") ? "陈简历" : "Alex Chen",
      email: "alex.chen@example.com",
      phone: "+86 138 0000 0000",
      location: language.startsWith("zh") ? "香港" : "Hong Kong",
      linkedin: "linkedin.com/in/alex-chen",
    },
    sections,
    layout_template_id: "resume-standard",
    layout_profile_version: STANDARD_PROFILE_VERSION,
    layout_profile_hash: STANDARD_PROFILE_HASH,
    layout_tuning: {
      body_font_scale: 1,
      body_line_height: 1.18,
      section_gap_scale: 1,
      item_gap_scale: 1,
      bullet_gap_scale: 1,
    },
    layout_target_band: {
      minimum: 0.85,
      target: 0.9,
      maximum: 0.98,
    },
  };
}

const educationZh = section("section-education", "education", "教育经历", [
  item("education-1", {
    title: "香港科技大学",
    organization: "计算机科学与工程",
    role: "理学硕士",
    location: "香港",
    start_date: "2023.09",
    end_date: "2025.06",
    bullets: [],
    raw_text: null,
  }),
]);

const educationEn = section("section-education", "education", "EDUCATION", [
  item("education-1", {
    title: "Hong Kong University of Science and Technology",
    organization: "Computer Science and Engineering",
    role: "Master of Science",
    location: "Hong Kong",
    start_date: "Sep 2023",
    end_date: "Jun 2025",
    bullets: [],
    raw_text: null,
  }),
]);

function qualifiedChinese(): CurrentResumeStructure {
  return baseStructure("zh-CN", [
    educationZh,
    section("section-experience", "experience", "工作经历", [
      item("work-1", {
        title: "智能产品实习生",
        organization: "示例科技有限公司",
        role: "产品与数据团队",
        location: "深圳",
        start_date: "2025.01",
        end_date: "2025.06",
        raw_text: null,
        bullets: bulletList("zh-product", [
          "梳理企业客户的简历筛选流程与高频痛点，结合访谈记录设计结构化需求清单，支持团队明确首版产品范围与交付优先级；同步将每项结论关联到访谈编号和原始记录，便于评审追溯判断依据并在范围变化后快速复核。",
          "基于真实业务数据搭建岗位与候选人标签分析看板，统一指标口径和异常检查流程，为每周产品复盘提供可追溯的数据依据；补充字段血缘和刷新日志，确保指标波动可以定位到具体数据批次并由负责人完成复核。",
          "协同工程团队拆解文档解析与内容生成链路，持续验证中文、英文和混排文本的边界场景，减少重复人工检查工作；把每个失败样本记录为可复现用例，供回归测试持续验证修复效果和版本兼容性，并沉淀测试清单。",
          "整理用户反馈并维护问题分级台账，将影响范围、复现步骤和验收条件写入迭代任务，提升跨职能沟通与问题闭环效率；每周汇总新增问题与处理状态，让产品、设计和研发围绕同一事实集合推进闭环，并明确后续责任人。",
        ]),
      }),
      item("work-2", {
        title: "数据分析实习生",
        organization: "示例咨询公司",
        role: "数字化咨询团队",
        location: "上海",
        start_date: "2024.05",
        end_date: "2024.09",
        raw_text: null,
        bullets: bulletList("zh-analysis", [
          "清洗并核对来自多个业务部门的运营数据，建立字段映射、缺失值处理和抽样复核规则，形成可重复执行的数据准备流程；通过脚本保留处理日志和输入版本，使后续分析能够复用相同口径并复查异常来源。",
          "围绕客户转化路径分析渠道表现和关键流失环节，将结论整理为管理层可直接使用的图表和行动建议；同时标注样本范围与假设限制，帮助业务负责人判断结论适用场景并制定后续验证计划，跟踪实际改进结果。",
          "参与交付材料的事实核验和版本管理，确保图表数字、分析口径与原始数据保持一致，并记录每次修改的来源；对关键结论逐项登记引用位置和审核人员，降低多人协作中误用旧版数字的风险，保留完整审核记录。",
          "建立周度经营数据更新清单，监控文件到达、字段变更和异常值数量，及时定位影响分析进度的输入问题；将处理结论同步到共享台账，帮助项目成员掌握数据状态并安排后续工作，在更新后再次完成抽样复核。",
        ]),
      }),
      item("work-3", {
        title: "产品运营助理",
        organization: "校内创新中心",
        role: "数字产品组",
        location: "香港",
        start_date: "2023.10",
        end_date: "2024.03",
        raw_text: null,
        bullets: bulletList("zh-operations", [
          "跟进校内工具的试用反馈并整理使用场景，依据问题频次、影响范围和实施成本协助团队安排改进顺序；在每次发布后回访问题提交者，确认实际结果并补充仍未覆盖的边界情况，记录回访日期与处理状态。",
          "维护功能说明、常见问题和发布记录，统一页面截图、操作步骤与版本信息，减少试用成员重复咨询；将高频疑问转化为简短指引，并根据后续反馈持续修正文档中的模糊表述，定期核对页面版本与内容是否一致。",
          "协助组织产品演示和小范围可用性测试，记录参与者完成关键任务的路径、耗时与阻塞点；会后按任务阶段归纳观察结果，为界面调整和下一轮验证准备清晰的检查清单，并逐项确认问题是否已经得到解决。",
          "汇总每月使用数据和活动记录，核对指标定义后制作简洁的运营复盘材料，说明变化趋势及可能原因；对无法由现有数据验证的判断明确标注限制，避免把推测直接写成确定结论，并列出下一步验证所需数据。",
        ]),
      }),
    ]),
    section("section-project", "project", "项目经历", [
      item("project-1", {
        title: "求职材料管理与生成工具",
        organization: "个人项目",
        role: "产品设计与工程实现",
        location: "",
        start_date: "2025.03",
        end_date: "至今",
        raw_text: null,
        bullets: bulletList("zh-resume-project", [
          "设计经历、岗位描述和简历版本之间的结构化关联方式，使生成内容能够回溯到具体经历与事实来源；为每条要点保存稳定标识和引用记录，让后续修改可以核对依据并识别缺少来源的表述，及时阻止无依据内容进入定稿。",
          "实现基于稳定标识的局部编辑与候选版本管理，避免修改单个要点时覆盖已经通过校验的其他内容；在应用补丁前校验目标版本和字段范围，降低并发修改造成内容错位或意外丢失的风险，并保留失败补丁的诊断信息。",
          "使用真实浏览器排版数据检查页面高度和要点尾行宽度，为一页简历生成提供确定性的质量反馈；将失败原因转换为结构化诊断，支持生成流程按剩余空间选择扩写、压缩或调整内容分配，并记录每轮测量结果。",
        ]),
      }),
      item("project-2", {
        title: "课程资料检索与问答原型",
        organization: "团队课程项目",
        role: "数据处理与产品实现",
        location: "",
        start_date: "2024.09",
        end_date: "2024.12",
        raw_text: null,
        bullets: bulletList("zh-search-project", [
          "整理课程讲义与公开资料的文件结构，设计标题、章节和来源页码等元数据字段，支持检索结果回到原文位置；对解析失败和重复内容建立检查规则，减少无效片段进入后续索引的数量，并保留清理过程记录。",
          "实现检索结果展示与来源引用交互，使用户能够同时查看回答、关联片段和文件信息，并快速核对上下文；通过固定问题集记录命中情况和错误类型，为迭代切分策略提供可比较的验证依据，复查每次参数变更影响。",
          "与团队成员共同制定演示范围和验收清单，按功能路径检查文件导入、问题查询与异常提示等核心流程；将测试中发现的问题关联到输入样本和复现步骤，确保修复后能够执行一致的回归验证，并更新最终验收记录。",
        ]),
      }),
    ]),
    section("section-skills", "skills", "专业技能", [
      item("skills-1", {
        title: "技术与工具",
        organization: null,
        role: null,
        location: null,
        start_date: null,
        end_date: null,
        raw_text: "TypeScript、Python、SQL、Vue、Electron、数据分析、产品需求拆解、结构化写作",
        bullets: [],
      }),
    ]),
  ]);
}

function qualifiedEnglish(): CurrentResumeStructure {
  return baseStructure("en-US", [
    educationEn,
    section("section-experience", "experience", "WORK EXPERIENCE", [
      item("work-1", {
        title: "Product and Data Intern",
        organization: "Example Technology Limited",
        role: "Product Intelligence Team",
        location: "Shenzhen",
        start_date: "Jan 2025",
        end_date: "Jun 2025",
        raw_text: null,
        bullets: [
          bullet("en-1", "Mapped enterprise resume-review workflows and converted interview evidence into a structured requirement backlog that clarified the first release scope."),
          bullet("en-2", "Built a traceable analytics dashboard with shared metric definitions and anomaly checks to support weekly product reviews and prioritization decisions."),
          bullet("en-3", "Partnered with engineers to test document parsing and content generation across English, Chinese, and mixed-language edge cases before release."),
          bullet("en-4", "Maintained a severity-based feedback register with reproducible steps and acceptance criteria, improving cross-functional issue ownership and closure."),
        ],
      }),
      item("work-2", {
        title: "Data Analytics Intern",
        organization: "Example Advisory",
        role: "Digital Consulting",
        location: "Shanghai",
        start_date: "May 2024",
        end_date: "Sep 2024",
        raw_text: null,
        bullets: [
          bullet("en-5", "Cleaned operational data from multiple teams and established field mappings, missing-value rules, and sampling checks for repeatable analysis."),
          bullet("en-6", "Analyzed channel performance and conversion drop-off points, translating findings into management-ready charts and concrete follow-up actions."),
          bullet("en-7", "Verified figures and analytical definitions against source data while maintaining a clear record of changes across client deliverable versions."),
        ],
      }),
    ]),
    section("section-project", "project", "PROJECTS", [
      item("project-1", {
        title: "Evidence-Grounded Resume Workspace",
        organization: "Independent Project",
        role: "Product Design and Engineering",
        location: "Hong Kong",
        start_date: "Mar 2025",
        end_date: "Present",
        raw_text: null,
        bullets: [
          bullet("en-8", "Designed structured links between experience records, job requirements, and resume versions so each generated claim remains traceable to source evidence."),
          bullet("en-9", "Implemented stable-ID patches and candidate snapshots to preserve verified content while a single bullet or section is revised."),
          bullet("en-10", "Used browser layout measurements to validate page density and final-line width, providing deterministic feedback for one-page compilation."),
        ],
      }),
    ]),
    section("section-skills", "skills", "SKILLS", [
      item("skills-1", {
        title: "Technology and Methods",
        organization: null,
        role: null,
        location: null,
        start_date: null,
        end_date: null,
        raw_text: "TypeScript, Python, SQL, Vue, Electron, product discovery, data analysis, structured writing",
        bullets: [],
      }),
    ]),
  ]);
}

function underfilled(): CurrentResumeStructure {
  return baseStructure("zh-CN", [educationZh]);
}

function tailFailure(): CurrentResumeStructure {
  return baseStructure("zh-CN", [
    educationZh,
    section("section-experience", "experience", "工作经历", [
      item("work-tail", {
        title: "产品实习生",
        organization: "示例科技有限公司",
        role: "产品团队",
        location: "深圳",
        start_date: "2025.01",
        end_date: "2025.06",
        raw_text: null,
        bullets: [bullet("tail-short", "整理需求。")],
      }),
    ]),
  ]);
}

function overflow(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const work = structure.sections.find((candidate) => candidate.type === "experience");
  assertSection(work);
  for (let index = 0; index < 18; index += 1) {
    work.items[0]?.bullets.push(
      bullet(
        `overflow-${index + 1}`,
        `补充验证条目 ${index + 1}：围绕同一套真实排版基准执行页面结构、字体加载、视觉行分组和溢出诊断，用于确认内容超过单页后能够稳定返回明确错误。`,
      ),
    );
  }
  return structure;
}

function mixed(): CurrentResumeStructure {
  const structure = qualifiedChinese();
  const skills = structure.sections.find((candidate) => candidate.type === "skills");
  assertSection(skills);
  if (skills.items[0]) {
    skills.items[0].raw_text =
      "TypeScript、Python、SQL、Vue 3、Electron、Chromium DOM Measurement、产品需求拆解";
  }
  return structure;
}

function assertSection(
  value: ResumeSection | undefined,
): asserts value is ResumeSection {
  if (!value) {
    throw new Error("Fixture section is missing");
  }
}

export const RESUME_FIXTURES = {
  "zh-qualified": qualifiedChinese(),
  "en-qualified": qualifiedEnglish(),
  "mixed-qualified": mixed(),
  underfilled: underfilled(),
  "tail-failure": tailFailure(),
  overflow: overflow(),
} as const;

export type ResumeFixtureId = keyof typeof RESUME_FIXTURES;

export function getResumeFixture(id: string): CurrentResumeStructure {
  const fixture = RESUME_FIXTURES[id as ResumeFixtureId];
  if (!fixture) {
    throw new Error(`Unknown resume fixture: ${id}`);
  }
  return structuredClone(fixture);
}
