import { z } from "zod";

const base = z.object({
  accountId: z.string().min(1, "请选择账号"),
  name: z.string().trim().min(1, "请输入角色名").max(80, "角色名不能超过 80 个字符"),
  className: z.string().trim().min(1, "请输入职业").max(80, "职业不能超过 80 个字符"),
  fame: z.coerce.number().int().positive("名望必须为正数"),
  strengthTier: z.enum(["high", "medium", "low"]),
  notes: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
});

export const characterSchema = z.discriminatedUnion("role", [
  base.extend({ role: z.literal("dealer"), damageScore: z.coerce.number().positive("请输入有效的模拟伤害"), buffScore: z.null().optional() }),
  base.extend({ role: z.literal("buffer"), buffScore: z.coerce.number().positive("请输入有效的奶量"), damageScore: z.null().optional() }),
]);

export type CharacterInput = z.infer<typeof characterSchema>;
export type CharacterFormInput = z.input<typeof characterSchema>;
