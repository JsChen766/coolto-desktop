import { CooltoApiClient } from "../src/api/coolto-api-client.js";
import { DEFAULT_API_BASE_URL } from "../src/config.js";
import { ResumeSourceSnapshotBuilder } from "../src/resume/source-snapshot.js";
import { STANDARD_RESUME_TEMPLATE_SNAPSHOT } from "../src/resume/template-contract.js";

const email = process.env.COOLTO_EMAIL?.trim();
const password = process.env.COOLTO_PASSWORD;
if (!email || !password) {
  throw new Error("COOLTO_EMAIL and COOLTO_PASSWORD are required for the smoke test");
}
delete process.env.COOLTO_PASSWORD;

const client = new CooltoApiClient({
  baseUrl: process.env.COOLTO_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
});

try {
  await client.login({ email, password });
  const [profile, jdResult, experienceResult] = await Promise.all([
    client.getUserProfile(),
    client.listJds({ limit: 100 }),
    client.searchExperiences({ limit: 100 }),
  ]);
  const selectedJd = jdResult.items[0];
  const selectedExperiences = experienceResult.items
    .filter((experience) => experience.status === "active")
    .slice(0, 20);

  if (!selectedJd || selectedExperiences.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        passed: true,
        snapshotBuilt: false,
        profileReadable: Boolean(profile.email),
        jdCount: jdResult.items.length,
        experienceCount: experienceResult.items.length,
        reason: !selectedJd ? "no_jd" : "no_active_experience",
      }, null, 2)}\n`,
    );
  } else {
    const builder = new ResumeSourceSnapshotBuilder({
      currentUser: client,
      profile: client,
      jd: client,
      experience: client,
    });
    const snapshot = await builder.build({
      jdId: selectedJd.id,
      experienceIds: selectedExperiences.map((experience) => experience.id),
      template: STANDARD_RESUME_TEMPLATE_SNAPSHOT,
    });
    process.stdout.write(
      `${JSON.stringify({
        passed: true,
        snapshotBuilt: true,
        profileReadable: Boolean(snapshot.profile.email),
        jdRequirements: snapshot.jd.requirements.length,
        experiences: snapshot.experiences.length,
        allCurrentRevisionsLocked: snapshot.experiences.every(
          (experience) =>
            Boolean(experience.revisionId) && Boolean(experience.contentHash),
        ),
        sourceFingerprintPrefix: snapshot.sourceFingerprint.slice(0, 12),
      }, null, 2)}\n`,
    );
  }
} finally {
  await client.logout().catch(() => undefined);
}
