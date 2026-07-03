import { z } from "zod";

export const characterSchema = z.object({
  name: z.string().min(2).max(80),
  age: z.coerce.number().int().min(1).max(999),
  description: z.string().min(10).max(5000),
  appearance: z.string().max(3000).optional().nullable(),
  personality: z.string().max(3000).optional().nullable(),
  speechStyle: z.string().max(2000).optional().nullable(),
  setting: z.string().max(3000).optional().nullable(),
  boundaries: z.string().max(3000).optional().nullable(),
  starterScene: z.string().max(5000).optional().nullable()
});

export const chatSchema = z.object({
  title: z.string().min(2).max(120),
  mode: z
    .enum(["CLASSIC", "CINEMATIC", "DIALOGUE_FOCUS", "SLOW_BURN", "ADVENTURE_GM", "DARK_DRAMA", "ADULT", "PHOTO_SCENE"])
    .default("CLASSIC"),
  characterIds: z.array(z.string()).min(1).max(5),
  lorebook: z.string().max(10000).optional().nullable(),
  importedContext: z.string().max(50000).optional().nullable()
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000)
});

export const imageSchema = z.object({
  chatId: z.string().optional(),
  prompt: z.string().min(5).max(4000),
  model: z.string().optional(),
  size: z.string().optional()
});

export const acceptAdultSchema = z.object({
  accepted: z.literal(true)
});

export const starsSuccessSchema = z.object({
  telegramPaymentChargeId: z.string(),
  providerPaymentChargeId: z.string().optional(),
  payload: z.string()
});
