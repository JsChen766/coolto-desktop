import type {
  ExperienceCategory,
  ExperienceDetail,
  JdRecord,
  UserProfile,
} from "../src/api/types.js";
import { ResumeSourceSnapshotBuilder } from
  "../src/resume/source-snapshot.js";

export interface TailEvalBullet {
  currentText: string;
  growthSeedText: string;
  sourceText: string;
}

export interface TailEvalExperience {
  id: string;
  tier?: "main" | "secondary";
  localizedPosition?: string;
  detail: ExperienceDetail;
  bullets: TailEvalBullet[];
}

const EXTRA_SOURCE_FACTS = [
  "模型底稿保留 WACC、永续增长率和收入增速三组敏感性参数，供研究员逐项复核",
  "简报同时记录招股书页码、交易所问询日期与数据更新时间，减少后续查证成本",
  "每家企业另有一页客户集中度、毛利结构和未来 18 个月资金需求的访谈摘要",
  "预测底稿逐项标记历史数据、管理层指引和分析师假设，并保留版本变更原因",
  "技术路线比较还覆盖设备投资、良率爬坡和核心供应商变化，按月更新证据来源",
  "报告结论经过三轮内部评审，并用乐观、基准和悲观情景解释盈利预测区间",
  "研究补充验证车规认证周期、客户导入节奏和扩产计划对收入兑现的影响",
  "企业清单记录融资轮次、核心产品、主要客户和最近经营事件，支持项目周会筛选",
  "清洗流程使用抽样复核、字段完整率和跨表勾稽三项检查，并保留异常处理日志",
  "访谈结论按事实、管理层判断和待验证假设分类，避免把单一观点当作确定结论",
  "模型输出附带假设来源、公式检查和情景切换说明，便于项目组复用与复核",
  "流程图另行标注负责人、输入材料、控制点和预计耗时，用于定位协作瓶颈",
  "竞品矩阵每周依据产品公告和帮助中心更新，并记录功能上线时间与适用地区",
  "看板同时设置口径变更记录和异常阈值，方便运营与合规团队追踪数据波动",
  "案例库保留企业原话、证据出处和编码标签，使跨行业结论能够回溯到访谈材料",
  "评分结果通过两名研究员交叉复核，对分歧项重新查阅原始材料后形成一致记录",
  "课题组依据治理、技术和变革管理三类障碍安排后续专家验证与案例补访",
] as const;
const GROWTH_SEED_FACTS = [
  "模型版本另记更新时间、维护人与审阅状态",
  "简报索引另列来源链接、发布日期和更新责任人",
  "访谈底稿另记访谈时间、参会角色与待办事项",
  "预测文件另设参数变更说明和审批状态记录",
  "路线跟踪表另含数据日期、口径备注与审核人",
  "报告附录另列问题清单、评审意见和处理状态",
  "行业底稿另记资料日期、来源机构和复核结果",
  "企业清单另含信息日期、跟进人员与验证状态",
  "清洗日志另记规则版本、执行日期和复核结果",
  "访谈台账另列受访角色、记录日期和确认状态",
  "模型说明另记公式版本、检查人员和更新时间",
  "流程台账另列节点责任人、材料状态和更新时间",
  "竞品表另记采集日期、来源页面和审核状态",
  "看板说明另列指标版本、更新日期和维护人员",
  "案例索引另记访谈编号、整理日期和校验状态",
  "评分底稿另列证据日期、复核人员和分歧状态",
  "课题记录另含访谈日期、参与角色和验证状态",
] as const;
let extraSourceFactIndex = 0;

export function createTailEvalFixture() {
  const experiences = [
    experience("longbridge", "work", "股票研究实习生", "LongBridge Singapore",
      "投资者关系研究实习生", "2025-02", "2025-07", "main", [
        bullet("围绕新能源与半导体产业链，使用 DCF 和可比公司法分析 10 家上市公司，形成季度估值更新",
          "并按业务分部拆解收入、毛利率与资本开支假设，向研究团队解释估值敏感性"),
        bullet("跟踪 NEEQ、STAR、GEM 每周 IPO 管道，识别专精特新企业并撰写市场情报简报",
          "同步核验招股书、交易所问询与行业数据，累计获得全渠道 10 万次阅读"),
        bullet("联合 2 家 VC 对 5 家半导体与泛 AI 初创企业开展创始人访谈和商业尽调",
          "围绕客户结构、单位经济模型和融资用途建立判断框架，完成投资备忘录"),
        bullet("搭建 14 个季度的财务预测模型，覆盖收入、成本、现金流与估值情景",
          "使用敏感性矩阵检验核心假设，并为每周投研例会准备风险提示与结论摘要"),
      ]),
    experience("mechanica", "work", "机械股票研究实习生", "Mechanica Group",
      "股票研究实习生", "2023-07", "2023-10", "secondary", [
        bullet("研究 10 家 A 股公司并覆盖 DVI、HJT、SiC 技术路线，整理行业竞争格局",
          "通过公司公告、专家访谈与供应链数据交叉验证产能规划和需求节奏"),
        bullet("独立撰写 20 页深度报告，识别关键变量并评估其对盈利预测的影响",
          "把 30 项跟踪指标纳入季度更新模板，支持研究员快速复核核心判断"),
        bullet("完成 SiC 行业研究，比较东风日产与头部厂商的技术和商业化路径",
          "拆分晶圆、器件和终端应用环节，归纳成本曲线与渗透率提升条件"),
      ]),
    experience("analyst", "work", "分析师实习生", "36Kr",
      "投资分析实习生", "2024-02", "2025-06", "main", [
        bullet("每周跟踪 IPO 管道并识别高潜企业，向研究团队输出行业动态与公司清单",
          "统一公司筛选口径和信息来源，维护 80 家企业的融资及经营数据"),
        bullet("使用 Excel 和 Python 清洗 6 万条投融资记录，建立行业与轮次标签体系",
          "通过异常值检查和重复记录合并提升数据准确率，缩短周报准备时间"),
        bullet("访谈 12 位创始人和投资人，围绕商业模式、客户验证与竞争壁垒开展尽调",
          "将访谈纪要映射到收入质量、留存和获客效率指标，形成可比较结论"),
        bullet("撰写投资备忘录与商业模型，覆盖市场规模、单位经济性和三种增长情景",
          "对关键假设执行敏感性分析，并向项目组说明下行情景和风险触发点"),
      ]),
    experience("osl", "work", "交易所实习生", "OSL", "产品分析实习生",
      "2025-10", "2026-05", "secondary", [
        bullet("分析数字资产平台在 OTC 交易、托管和综合账户中的运营流程与客户路径",
          "梳理 9 个关键节点的转化和中断原因，向产品团队提交流程优化清单"),
        bullet("比较 Coinbase、Binance 等平台的产品范围、托管结构和费率设计",
          "把 32 项功能与合规要求整理为竞品矩阵，支持新功能优先级讨论"),
        bullet("使用 SQL 监控 8 个账户激活指标并建立周度异常看板",
          "按客户类型和渠道拆分漏斗，定位身份验证环节的主要流失来源，并向产品团队同步异常原因"),
      ]),
    experience("ai-project", "project", "企业战略研究助理", "浙江大学创新管理研究院",
      "企业战略研究助理", "2023-10", "2024-01", "secondary", [
        bullet("深访 50 家采用生成式 AI 的企业，研究技术应用对组织流程的影响",
          "按行业、企业规模和应用成熟度编码访谈材料，形成结构化案例库"),
        bullet("建立企业数字化转型评估框架，覆盖战略、人才、数据和流程四个维度",
          "结合二手资料与访谈证据校准评分标准，输出管理层研究报告"),
        bullet("组织 6 场专家访谈并整理 18 万字记录，提炼企业落地中的共性障碍",
          "把结论归纳为治理、技术和变革管理建议，支持课题组后续分析"),
      ]),
    skillsExperience(),
    education("edu-cuhk", "香港中文大学", "金融学硕士", "2025-09", "2026-07",
      "金融学硕士，主修课程：公司金融、投资学、财务建模、证券分析、计量经济学、固定收益、衍生品定价、风险管理。GPA 3.8/4.0，专业前 10%。"),
    education("edu-zju", "浙江大学", "英语文学学士", "2021-09", "2025-06",
      "英语文学学士，主修课程：学术写作、跨文化沟通、统计学、微观经济学。GPA 3.89/4.0。"),
    education("edu-lse", "London School of Economics", "暑期交换项目", "2024-07", "2024-08",
      "暑期交换项目，完成资本市场与应用计量课程。"),
  ];
  const details = experiences.map((entry) => entry.detail);
  const byId = new Map(details.map((entry) => [entry.id, entry]));
  const jd = createJd();
  const builder = new ResumeSourceSnapshotBuilder({
    currentUser: {
      getCurrentUser: async () => ({ id: "tail-eval-user", email: "eval@example.com" }),
    },
    profile: { getUserProfile: async () => createProfile() },
    jd: {
      listJds: async () => ({ items: [jd], nextCursor: null }),
      getJd: async () => structuredClone(jd),
    },
    experience: {
      searchExperiences: async (options) => ({
        items: details.filter((entry) =>
          (!options?.category || entry.category === options.category) &&
          (!options?.status || entry.status === options.status)
        ),
        nextCursor: null,
      }),
      getExperience: async (id) => {
        const detail = byId.get(id);
        if (!detail) throw new Error(`Unknown tail eval experience ${id}`);
        return structuredClone(detail);
      },
    },
  }, { now: () => new Date("2026-08-19T00:00:00.000Z") });
  return { builder, experiences: experiences.filter((entry) => entry.detail.category !== "education") };
}

function bullet(currentText: string, omittedFact: string): TailEvalBullet {
  const expandedCurrentText = `${currentText}，${omittedFact}`;
  const extraFact = EXTRA_SOURCE_FACTS[extraSourceFactIndex++];
  const seedFact = GROWTH_SEED_FACTS[extraSourceFactIndex - 1];
  if (!extraFact || !seedFact) {
    throw new Error("Tail eval fixture is missing a source fact");
  }
  return {
    currentText: expandedCurrentText,
    growthSeedText: `${expandedCurrentText}，${seedFact}`,
    sourceText: `${expandedCurrentText}；补充记录：${seedFact}；原始记录：${extraFact}`,
  };
}

function experience(
  id: string,
  category: ExperienceCategory,
  title: string,
  organization: string,
  role: string,
  startDate: string,
  endDate: string,
  tier: "main" | "secondary",
  bullets: TailEvalBullet[],
): TailEvalExperience {
  return {
    id, tier, localizedPosition: role, bullets,
    detail: detail({ id, category, title, organization, role, startDate,
      endDate, content: bullets.map((entry) => entry.sourceText).join("。") + "。",
      tags: ["投资研究", "数据分析", "SQL", "Python"] }),
  };
}

function skillsExperience(): TailEvalExperience {
  const sourceText = "熟练使用 Python、SQL、Excel、Wind、Bloomberg、DCF 与财务建模，英语可作为工作语言";
  return {
    id: "skills", bullets: [{
      currentText: sourceText,
      growthSeedText: sourceText,
      sourceText,
    }],
    detail: detail({ id: "skills", category: "other", title: "专业技能",
      organization: "", role: "", startDate: null, endDate: null,
      content: `${sourceText}。`, tags: ["Python", "SQL", "Excel"],
      resumeSectionKey: "skills", resumeSectionLabel: "专业技能" }),
  };
}

function education(
  id: string, organization: string, role: string, startDate: string,
  endDate: string, content: string,
): TailEvalExperience {
  return {
    id, bullets: [],
    detail: detail({ id, category: "education", title: organization,
      organization, role, startDate, endDate, content, tags: [] }),
  };
}

function detail(input: {
  id: string; category: ExperienceCategory; title: string; organization: string;
  role: string; startDate: string | null; endDate: string | null; content: string;
  tags: string[]; resumeSectionKey?: string; resumeSectionLabel?: string;
}): ExperienceDetail {
  const revision = { id: `revision-${input.id}`, experienceId: input.id,
    content: input.content, source: "manual", revisionHash: `hash-${input.id}`,
    factBankStatus: "ready", createdAt: "2026-08-01T00:00:00.000Z" };
  return { id: input.id, category: input.category, title: input.title,
    organization: input.organization, role: input.role, location: "香港",
    startDate: input.startDate, endDate: input.endDate, tags: input.tags,
    resumeSectionKey: input.resumeSectionKey ?? null,
    resumeSectionLabel: input.resumeSectionLabel ?? null, status: "active",
    currentRevisionId: revision.id, currentRevision: revision, revisions: [revision],
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z",
    entityVersion: 1, deletedAt: null };
}

function createProfile(): UserProfile {
  return { fullName: "陈明", contactEmail: "resume@example.com",
    email: "eval@example.com", phone: "+852 6123 4567", location: "香港",
    linkedinUrl: "https://linkedin.com/in/resume-eval", githubUrl: null,
    personalWebsite: null, currentTitle: null, currentCompany: null,
    yearsOfExperience: 2, careerStage: "early_career", targetRoles: [],
    targetIndustries: [], targetLocations: [], preferredLanguage: "zh-CN",
    resumeStyle: "standard" };
}

function createJd(): JdRecord {
  return { id: "tail-eval-jd", title: "投资者关系实习生", company: "小米集团",
    targetRole: "投资者关系", rawText: "支持资本市场研究、财务分析、数据处理与跨团队沟通。",
    requirements: [{ id: "req-research", text: "具备资本市场研究与财务分析能力",
      category: "domain", importance: "high", keywords: ["投资研究", "财务分析"],
      weight: 0.9, v2Importance: "must_have", v2Category: "domain" },
      { id: "req-data", text: "能够使用 SQL、Python 或 Excel 处理数据",
        category: "technology", importance: "medium", keywords: ["SQL", "Python", "Excel"],
        weight: 0.7, v2Importance: "preferred", v2Category: "technology" }],
    jdHash: "tail-eval-jd-hash", requirementMapId: "tail-eval-map",
    requirementsOrigin: "parsed", sourceThreadId: null, entityVersion: 1,
    deletedAt: null, createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z" };
}
