import { z } from "zod";

export const templateSchema = z
  .object({
    name: z.string().trim().min(3, "укажите название").max(200),
    documentType: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,49}$/, "латиница, цифры и _, например consultation"),
    description: z.string().trim().max(1000).default(""),
    isActive: z.boolean().default(true),
    fields: z
      .array(
        z.object({
          key: z
            .string()
            .trim()
            .regex(/^[a-z][a-z0-9_]{0,49}$/, "ключ поля: латиница, цифры и _"),
          label: z.string().trim().min(1, "укажите название поля").max(200),
          description: z.string().trim().max(1000).default(""),
          required: z.boolean().default(false),
          multiline: z.boolean().default(true),
        }),
      )
      .min(1, "добавьте хотя бы одно поле")
      .max(40),
  })
  .refine((t) => new Set(t.fields.map((f) => f.key)).size === t.fields.length, {
    message: "ключи полей должны быть уникальны",
    path: ["fields"],
  });
