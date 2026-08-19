import { z } from "zod";

export const difficultyCodeSchema = z.enum(["normal", "hard", "judgment"]);

const optionalReferenceSchema = z
  .union([z.number(), z.string()])
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().finite().nonnegative().nullable());

export const waveSchema = z.object({
  order: z.coerce.number().int().positive(),
  difficulty: difficultyCodeSchema,
});

export const raidEventSchema = z
  .object({
    title: z.string().trim().min(1, "请输入活动名称").max(160, "活动名称不能超过 160 个字符"),
    eventDate: z.string().datetime({ message: "请选择有效的活动时间" }),
    gameWeek: z.string().regex(/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/, "周次格式应为 YYYY-Www"),
    waves: z.array(waveSchema).min(1, "至少创建一波"),
  })
  .superRefine((value, context) => {
    const seenOrders = new Set<number>();
    value.waves.forEach((wave, index) => {
      if (seenOrders.has(wave.order)) {
        context.addIssue({
          code: "custom",
          message: "波次序号不能重复",
          path: ["waves", index, "order"],
        });
      }
      seenOrders.add(wave.order);
      if (wave.order !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "波次序号必须从 1 开始连续排列",
          path: ["waves", index, "order"],
        });
      }
    });
  });

export const difficultyPresetSchema = z.object({
  presetId: z.string().uuid(),
  minimumFame: optionalReferenceSchema,
  redDealerFame: optionalReferenceSchema.optional(),
  yellowDealerFame: optionalReferenceSchema.optional(),
  greenDealerFame: optionalReferenceSchema.optional(),
  redBufferPower: optionalReferenceSchema.optional(),
  yellowBufferPower: optionalReferenceSchema.optional(),
  greenBufferPower: optionalReferenceSchema.optional(),
  simulatedDamageReference: optionalReferenceSchema.optional(),
  autoAssignmentEnabled: z.boolean(),
});

export const registrationSchema = z.object({
  raidEventId: z.string().uuid(),
  state: z.enum(["participating", "absent"]),
  characterIds: z.array(z.string().uuid()),
});

export type RaidEventInput = z.infer<typeof raidEventSchema>;
export type DifficultyPresetInput = z.infer<typeof difficultyPresetSchema>;
