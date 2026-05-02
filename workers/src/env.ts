// Environment bindings for the Worker + Durable Object. Mirrors wrangler.toml.

export interface Env {
  WORLD: DurableObjectNamespace;

  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // LLM
  LLM_PROVIDER?: 'openai' | 'together' | 'ollama' | 'custom';
  OPENAI_API_KEY?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_EMBEDDING_MODEL?: string;
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
