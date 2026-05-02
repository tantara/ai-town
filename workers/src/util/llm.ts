// Worker-side LLM client. Identical behavior to convex/util/llm.ts but reads
// configuration from a passed-in `Env` instead of process.env (Workers don't
// expose process.env).

import type { Env } from '../env';

const OPENAI_EMBEDDING_DIMENSION = 1536;
const TOGETHER_EMBEDDING_DIMENSION = 768;
const OLLAMA_EMBEDDING_DIMENSION = 1024;

// MUST match the dimension declared in supabase/migrations/00000000000001_init.sql.
export const EMBEDDING_DIMENSION: number = OLLAMA_EMBEDDING_DIMENSION;

export interface LLMConfig {
  provider: 'openai' | 'together' | 'ollama' | 'custom' | 'openrouter';
  url: string;
  chatModel: string;
  embeddingModel: string;
  stopWords: string[];
  apiKey: string | undefined;
  extraHeaders?: Record<string, string>;
}

export function getLLMConfig(env: Env): LLMConfig {
  const provider = env.LLM_PROVIDER;
  if (provider ? provider === 'openai' : env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      url: 'https://api.openai.com',
      chatModel: env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
      embeddingModel: env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-ada-002',
      stopWords: [],
      apiKey: env.OPENAI_API_KEY,
    };
  }
  if (provider ? provider === 'openrouter' : env.OPENROUTER_API_KEY) {
    return {
      provider: 'openrouter',
      url: 'https://openrouter.ai/api',
      chatModel: env.OPENROUTER_CHAT_MODEL ?? 'deepseek/deepseek-v4-flash',
      embeddingModel: env.OPENROUTER_EMBEDDING_MODEL ?? 'text-embedding-ada-002',
      stopWords: [],
      apiKey: env.OPENROUTER_API_KEY,
      extraHeaders: {
        ...(env.OPENROUTER_REFERER ? { 'HTTP-Referer': env.OPENROUTER_REFERER } : {}),
        ...(env.OPENROUTER_TITLE ? { 'X-Title': env.OPENROUTER_TITLE } : {}),
      },
    };
  }
  if (env.TOGETHER_API_KEY) {
    return {
      provider: 'together',
      url: 'https://api.together.xyz',
      chatModel: env.TOGETHER_CHAT_MODEL ?? 'meta-llama/Llama-3-8b-chat-hf',
      embeddingModel: env.TOGETHER_EMBEDDING_MODEL ?? 'togethercomputer/m2-bert-80M-8k-retrieval',
      stopWords: ['<|eot_id|>'],
      apiKey: env.TOGETHER_API_KEY,
    };
  }
  if (env.LLM_API_URL) {
    if (!env.LLM_MODEL) throw new Error('LLM_MODEL is required');
    if (!env.LLM_EMBEDDING_MODEL) throw new Error('LLM_EMBEDDING_MODEL is required');
    return {
      provider: 'custom',
      url: env.LLM_API_URL,
      chatModel: env.LLM_MODEL,
      embeddingModel: env.LLM_EMBEDDING_MODEL,
      stopWords: [],
      apiKey: env.LLM_API_KEY,
    };
  }
  return {
    provider: 'ollama',
    url: env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    chatModel: env.OLLAMA_MODEL ?? 'llama3',
    embeddingModel: env.OLLAMA_EMBEDDING_MODEL ?? 'mxbai-embed-large',
    stopWords: ['<|eot_id|>'],
    apiKey: undefined,
  };
}

export interface LLMMessage {
  content: string | null;
  role: 'system' | 'user' | 'assistant' | 'function';
  name?: string;
}

export interface ChatRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
  response_format?: { type: 'text' | 'json_object' };
}

const RETRY_BACKOFF = [1000, 10_000, 20_000];
const RETRY_JITTER = 100;
type RetryError = { retry: boolean; error: any };

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
): Promise<{ retries: number; result: T; ms: number }> {
  let i = 0;
  for (; i <= RETRY_BACKOFF.length; i++) {
    try {
      const start = Date.now();
      const result = await fn();
      return { result, retries: i, ms: Date.now() - start };
    } catch (e) {
      const re = e as RetryError;
      if (i < RETRY_BACKOFF.length && re?.retry) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_BACKOFF[i] + RETRY_JITTER * Math.random()),
        );
        continue;
      }
      throw re?.error ?? e;
    }
  }
  throw new Error('Unreachable');
}

export async function chatCompletion(env: Env, body: ChatRequest) {
  const config = getLLMConfig(env);
  const model = body.model ?? config.chatModel;
  const stopWords: string[] = body.stop
    ? typeof body.stop === 'string'
      ? [body.stop]
      : body.stop
    : [];
  if (config.stopWords) stopWords.push(...config.stopWords);

  const { result: content, retries, ms } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}),
        ...(config.extraHeaders ?? {}),
      },
      body: JSON.stringify({ ...body, model, stop: stopWords.length ? stopWords : undefined }),
    });
    if (!result.ok) {
      const error = await result.text();
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Chat completion failed (${result.status}): ${error}`),
      };
    }
    const json = (await result.json()) as any;
    const c = json.choices?.[0]?.message?.content;
    if (typeof c !== 'string') throw new Error('Unexpected LLM response: ' + JSON.stringify(json));
    return c;
  });

  return { content, retries, ms };
}

export async function fetchEmbeddingBatch(env: Env, texts: string[]) {
  const config = getLLMConfig(env);
  if (config.provider === 'ollama') {
    const embeddings = await Promise.all(
      texts.map(async (t) => (await ollamaFetchEmbedding(env, t)).embedding),
    );
    return { embeddings };
  }
  const { result: json } = await retryWithBackoff(async () => {
    const result = await fetch(config.url + '/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}),
        ...(config.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: config.embeddingModel,
        input: texts.map((t) => t.replace(/\n/g, ' ')),
      }),
    });
    if (!result.ok) {
      throw {
        retry: result.status === 429 || result.status >= 500,
        error: new Error(`Embedding failed (${result.status}): ${await result.text()}`),
      };
    }
    return (await result.json()) as { data: { index: number; embedding: number[] }[] };
  });
  if (json.data.length !== texts.length) throw new Error('Unexpected embedding count');
  json.data.sort((a, b) => a.index - b.index);
  return { embeddings: json.data.map((d) => d.embedding) };
}

export async function fetchEmbedding(env: Env, text: string) {
  const { embeddings } = await fetchEmbeddingBatch(env, [text]);
  return { embedding: embeddings[0] };
}

export async function ollamaFetchEmbedding(env: Env, text: string) {
  const config = getLLMConfig(env);
  const { result } = await retryWithBackoff(async () => {
    const resp = await fetch(config.url + '/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embeddingModel, prompt: text }),
    });
    if (!resp.ok)
      throw {
        retry: resp.status === 429 || resp.status >= 500,
        error: new Error(`Embedding failed (${resp.status}): ${await resp.text()}`),
      };
    return ((await resp.json()) as { embedding: number[] }).embedding;
  });
  return { embedding: result };
}
