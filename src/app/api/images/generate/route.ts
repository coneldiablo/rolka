import { GeminiImageProvider } from "@/domain/providers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth";
import { handleApiError, jsonOk } from "@/server/api";
import { imageSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const input = imageSchema.parse(await request.json());
    const provider = new GeminiImageProvider();

    const generation = await prisma.imageGeneration.create({
      data: {
        userId: user.id,
        chatId: input.chatId,
        prompt: input.prompt,
        provider: provider.name,
        model: input.model ?? "gemini-2.5-flash-image",
        status: "QUEUED"
      }
    });

    try {
      const result = await provider.generateImage(input);
      const updated = await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: {
          status: "GENERATED",
          imageUrl: result.imageUrl ?? (result.b64Json ? `data:image/png;base64,${result.b64Json}` : null),
          model: result.model
        }
      });
      return jsonOk(updated);
    } catch (error) {
      const updated = await prisma.imageGeneration.update({
        where: { id: generation.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message : "Image generation failed." }
      });
      return jsonOk(updated, { status: 502 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
