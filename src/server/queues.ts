import { Queue, type ConnectionOptions } from "bullmq";

export type ImageJob = {
  imageGenerationId: string;
  userId: string;
  chatId?: string;
  prompt: string;
};

export type ContextSummaryJob = {
  chatId: string;
  userId: string;
};

const redisUrl = process.env.REDIS_URL;
let connection: ConnectionOptions | undefined;

function getConnection() {
  if (!redisUrl) return undefined;
  if (!connection) {
    const parsed = new URL(redisUrl);
    connection = {
      host: parsed.hostname,
      port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined
    };
  }
  return connection;
}

export function getQueues() {
  const redis = getConnection();
  if (!redis) return null;

  return {
    imageGeneration: new Queue<ImageJob, void, "generate">("image-generation", { connection: redis }),
    contextSummary: new Queue<ContextSummaryJob, void, "summarize">("context-summary", { connection: redis })
  };
}

export async function enqueueImageGeneration(job: ImageJob) {
  const queues = getQueues();
  if (!queues) return null;
  return queues.imageGeneration.add("generate", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
}

export async function enqueueContextSummary(job: ContextSummaryJob) {
  const queues = getQueues();
  if (!queues) return null;
  return queues.contextSummary.add("summarize", job, {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 500
  });
}
