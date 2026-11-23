import { z } from "zod";

export type AuthSchemaTranslateFn = (key: string) => string;

export function createPasswordSchema(t: AuthSchemaTranslateFn) {
  return z.string().min(10, t("validationPasswordMin")).max(128, t("validationPasswordMax"));
}

export function createNameSchema(t: AuthSchemaTranslateFn) {
  return z.string().trim().min(1, t("validationNameRequired")).max(100, t("validationNameMax"));
}

export function createEmailSchema(t: AuthSchemaTranslateFn) {
  return z
    .string()
    .trim()
    .min(1, t("validationEmailRequired"))
    .max(255, t("validationEmailMax"))
    .pipe(z.email(t("validationEmailInvalid")));
}

export function createLoginSchema(t: AuthSchemaTranslateFn) {
  return z.object({
    email: createEmailSchema(t),
    password: z
      .string()
      .min(1, t("validationPasswordRequired"))
      .max(128, t("validationPasswordMax")),
  });
}
