// Environment bindings for the Worker + Durable Object. Mirrors wrangler.toml.

export interface Env {
  WORLD: DurableObjectNamespace;

  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // URL the DO POSTs to when it wants the surrounding Worker to run an LLM
  // operation. Must be `${publicWorkerUrl}/agentOperations`. Required — without
  // it, agents never generate messages and conversations hang silently.
  OPERATIONS_URL: string;

  // LLM
  LLM_PROVIDER?: 'openai' | 'together' | 'ollama' | 'custom' | 'openrouter';
  OPENAI_API_KEY?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_CHAT_MODEL?: string;
  OPENROUTER_EMBEDDING_MODEL?: string;
  OPENROUTER_REFERER?: string;
  OPENROUTER_TITLE?: string;
  TOGETHER_API_KEY?: string;
  TOGETHER_CHAT_MODEL?: string;
  TOGETHER_EMBEDDING_MODEL?: string;
  OLLAMA_HOST?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_EMBEDDING_MODEL?: string;
  LLM_API_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_EMBEDDING_MODEL?: string;
}
