import { loadLocalEnv, readConfig } from "../../src/config.js";
import { CooltoApiClient } from "../../src/api/coolto-api-client.js";

loadLocalEnv();
const config = readConfig();
const client = new CooltoApiClient({ baseUrl: config.apiBaseUrl });
await client.login({ email: "dev@example.com", password: "devpassword" });
const jd = await client.createJd({
  title: "S45F-7e226033-v2 Data Engineering Intern",
  company: "Coolto Section F QA",
  targetRole: "Data Engineering Intern",
  rawText:
    "Build data pipelines with Scala, Apache Spark, and Hadoop. Process large-scale behavioral data under resource constraints. Create reusable features for retention and lifecycle analysis.",
  requirements: [
    {
      text: "Build data pipelines with Scala, Apache Spark, and Hadoop",
      category: "technology",
      importance: "high",
      keywords: ["Scala", "Apache Spark", "Hadoop"],
    },
    {
      text: "Process large-scale behavioral data under resource constraints",
      category: "domain",
      importance: "high",
      keywords: ["大规模", "用户行为数据", "4GB"],
    },
    {
      text: "Create reusable features for retention and lifecycle analysis",
      category: "domain",
      importance: "high",
      keywords: ["特征", "留存", "生命周期", "可复用"],
    },
  ],
});
console.log(JSON.stringify({ id: jd.id, title: jd.title, requirements: jd.requirements.map((r) => ({ id: r.id, keywords: r.keywords })) }));
await client.logout();
