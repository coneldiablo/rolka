import OpenAI from "openai";
import { containsAiTemplateLanguage } from "./safety";
import type { PromptMessage } from "./prompts";

export type AiProviderName = "aitunnel" | "openrouter" | "deepseek" | "gemini";

export type TextGenerationRequest = {
  messages: PromptMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type TextGenerationResponse = {
  content: string;
  provider: AiProviderName;
  model: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  model?: string;
  size?: string;
};

export interface TextProvider {
  name: AiProviderName;
  generateText(request: TextGenerationRequest): Promise<TextGenerationResponse>;
}

export interface ImageProvider {
  name: AiProviderName;
  generateImage(request: ImageGenerationRequest): Promise<{ imageUrl?: string; b64Json?: string; model: string }>;
}

type ProviderConfig = {
  name: AiProviderName;
  baseURL: string;
  apiKey?: string;
  defaultModel: string;
  defaultHeaders?: Record<string, string>;
};

export class OpenAiCompatibleTextProvider implements TextProvider {
  public readonly name: AiProviderName;
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error(`${config.name.toUpperCase()}_API_KEY_MISSING`);
    }
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: Number.parseInt(process.env.AI_PROVIDER_TIMEOUT_MS ?? "60000", 10),
      maxRetries: Number.parseInt(process.env.AI_PROVIDER_MAX_RETRIES ?? "1", 10)
    });
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResponse> {
    const model = request.model ?? this.defaultModel;
    const maxTokens = request.maxTokens ?? readOptionalMaxTokens();
    const completion = await this.client.chat.completions.create({
      model,
      messages: request.messages,
      temperature: request.temperature ?? 0.85,
      ...(maxTokens ? { max_tokens: maxTokens } : {})
    });
    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    return { content, provider: this.name, model };
  }
}

function readOptionalMaxTokens() {
  const raw = process.env.AI_TEXT_MAX_TOKENS;
  if (!raw) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function createConfiguredTextProviders(): TextProvider[] {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const configs: ProviderConfig[] = [
    {
      name: "aitunnel",
      baseURL: "https://api.aitunnel.ru/v1/",
      apiKey: process.env.AITUNNEL_API_KEY,
      defaultModel: process.env.AITUNNEL_MODEL ?? "deepseek-v4-flash"
    },
    {
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultModel: "openai/gpt-4o-mini",
      defaultHeaders: {
        "HTTP-Referer": appUrl,
        "X-OpenRouter-Title": "Rolka"
      }
    },
    {
      name: "deepseek",
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
      defaultModel: "deepseek-chat"
    },
    {
      name: "gemini",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.GEMINI_API_KEY,
      defaultModel: "gemini-2.5-flash"
    }
  ];

  return configs.flatMap((config) => {
    try {
      return [new OpenAiCompatibleTextProvider(config)];
    } catch {
      return [];
    }
  });
}

export async function generateWithFallback(
  providers: TextProvider[],
  request: TextGenerationRequest
): Promise<TextGenerationResponse> {
  const preferred = process.env.AI_DEFAULT_TEXT_PROVIDER as AiProviderName | undefined;
  const ordered = [...providers].sort((a, b) => {
    if (a.name === preferred) return -1;
    if (b.name === preferred) return 1;
    return 0;
  });

  let lastError: unknown;
  for (const provider of ordered) {
    try {
      const result = await provider.generateText(request);
      if (!result.content) {
        throw new Error("EMPTY_AI_RESPONSE");
      }
      if (containsAiTemplateLanguage(result.content)) {
        const retry = await provider.generateText({
          ...request,
          messages: [
            ...request.messages,
            {
              role: "user",
              content:
                "Перепиши предыдущий ответ внутри сцены. Убери ИИ-дисклеймеры, шаблонность и общий ассистентский тон. Сделай ответ короче, живее и удобнее для продолжения RP."
            }
          ]
        });
        if (retry.content && !containsAiTemplateLanguage(retry.content)) return retry;
      }
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("NO_AI_PROVIDER_CONFIGURED");
}

export class GeminiImageProvider implements ImageProvider {
  public readonly name = "gemini" as const;

  async generateImage(request: ImageGenerationRequest) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY_MISSING");
    const model = request.model ?? "gemini-2.5-flash-image";
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: request.prompt,
        response_format: "b64_json",
        n: 1,
        size: request.size ?? "1024x1024"
      })
    });
    if (!response.ok) {
      throw new Error(`GEMINI_IMAGE_FAILED_${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    return { b64Json: data.data?.[0]?.b64_json, imageUrl: data.data?.[0]?.url, model };
  }
}
