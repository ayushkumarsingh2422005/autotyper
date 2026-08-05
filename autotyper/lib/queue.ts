import { Redis } from "@upstash/redis";

export type JobMode = "paste" | "type";

export type Job = {
  id: string;
  text: string;
  mode: JobMode;
  createdAt: number;
  status: "pending" | "claimed";
};

const QUEUE_KEY = "autotyper:jobs";

type QueueState = {
  jobs: Job[];
};

const globalForQueue = globalThis as unknown as {
  __autotyperQueue?: QueueState;
  __autotyperRedis?: Redis | null;
};

function getMemoryState(): QueueState {
  if (!globalForQueue.__autotyperQueue) {
    globalForQueue.__autotyperQueue = { jobs: [] };
  }
  return globalForQueue.__autotyperQueue;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasRedisEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/** True when jobs persist across Vercel serverless instances. */
export function isPersistentStore(): boolean {
  return hasRedisEnv();
}

function getRedis(): Redis | null {
  if (!hasRedisEnv()) return null;
  if (globalForQueue.__autotyperRedis === undefined) {
    globalForQueue.__autotyperRedis = Redis.fromEnv();
  }
  return globalForQueue.__autotyperRedis;
}

export async function enqueue(text: string, mode: JobMode): Promise<Job> {
  const job: Job = {
    id: makeId(),
    text,
    mode,
    createdAt: Date.now(),
    status: "pending",
  };

  const redis = getRedis();
  if (redis) {
    // List of pending job ids; job payload stored separately for atomic claim
    await redis.set(`autotyper:job:${job.id}`, job, { ex: 60 * 60 }); // 1h TTL
    await redis.rpush(QUEUE_KEY, job.id);
    return job;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN required on Vercel",
    );
  }

  const state = getMemoryState();
  state.jobs.push(job);
  if (state.jobs.length > 200) {
    state.jobs = state.jobs.slice(-100);
  }
  return job;
}

export async function claimNext(): Promise<Job | null> {
  const redis = getRedis();
  if (redis) {
    // Atomically pop next id from the left of the list
    const id = await redis.lpop<string>(QUEUE_KEY);
    if (!id) return null;

    const job = await redis.get<Job>(`autotyper:job:${id}`);
    await redis.del(`autotyper:job:${id}`);
    if (!job) return null;

    return {
      ...job,
      status: "claimed",
    };
  }

  if (process.env.VERCEL) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN required on Vercel",
    );
  }

  const state = getMemoryState();
  const idx = state.jobs.findIndex((j) => j.status === "pending");
  if (idx === -1) return null;
  const job = state.jobs[idx];
  job.status = "claimed";
  state.jobs = state.jobs.filter(
    (j) =>
      j.status === "pending" ||
      j.id === job.id ||
      Date.now() - j.createdAt < 60_000,
  );
  return { ...job };
}

export async function pendingCount(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    return (await redis.llen(QUEUE_KEY)) || 0;
  }
  if (process.env.VERCEL) return 0;
  return getMemoryState().jobs.filter((j) => j.status === "pending").length;
}
