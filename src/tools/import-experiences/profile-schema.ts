import { Type } from "@earendil-works/pi-ai";

const contactField = Type.Object({
  value: Type.String({ minLength: 1, maxLength: 320 }),
  confidence: Type.Optional(Type.Union([Type.Literal("high"), Type.Literal("low")])),
});

export const parsedProfileSchema = Type.Object({
  fullName: Type.Optional(contactField),
  phone: Type.Optional(contactField),
  contactEmail: Type.Optional(contactField),
  location: Type.Optional(contactField),
  linkedinUrl: Type.Optional(contactField),
  githubUrl: Type.Optional(contactField),
  personalWebsite: Type.Optional(contactField),
});
