import { getLLMConfig, type LLMEnv } from './llm';

describe('getLLMConfig', () => {
  it('selects OpenAI when OPENAI_API_KEY is set and no provider is forced', () => {
    const cfg = getLLMConfig({ OPENAI_API_KEY: 'sk-test' } as LLMEnv);
    expect(cfg.provider).toBe('openai');
    expect(cfg.url).toBe('https://api.openai.com');
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.chatModel).toBe('gpt-4o-mini');
  });

  it('selects OpenRouter when OPENROUTER_API_KEY is set', () => {
    const cfg = getLLMConfig({ OPENROUTER_API_KEY: 'or-test' } as LLMEnv);
    expect(cfg.provider).toBe('openrouter');
    expect(cfg.url).toBe('https://openrouter.ai/api');
    expect(cfg.apiKey).toBe('or-test');
  });

  it('honors LLM_PROVIDER override even when other keys are present', () => {
    const cfg = getLLMConfig({
      LLM_PROVIDER: 'ollama',
      OPENAI_API_KEY: 'sk-ignored',
      OLLAMA_HOST: 'http://localhost:11434',
    } as LLMEnv);
    expect(cfg.provider).toBe('ollama');
    expect(cfg.url).toBe('http://localhost:11434');
    expect(cfg.apiKey).toBeUndefined();
  });

  it('falls back to ollama with a default host when nothing is configured', () => {
    const cfg = getLLMConfig({} as LLMEnv);
    expect(cfg.provider).toBe('ollama');
    expect(cfg.url).toBe('http://127.0.0.1:11434');
    expect(cfg.chatModel).toBe('llama3');
  });

  it("requires LLM_MODEL when LLM_API_URL is set without one", () => {
    expect(() =>
      getLLMConfig({ LLM_API_URL: 'http://example.com', LLM_EMBEDDING_MODEL: 'e' } as LLMEnv),
    ).toThrow(/LLM_MODEL is required/);
  });

  it('forwards OpenRouter referer/title headers when provided', () => {
    const cfg = getLLMConfig({
      OPENROUTER_API_KEY: 'or',
      OPENROUTER_REFERER: 'https://example.com',
      OPENROUTER_TITLE: 'My App',
    } as LLMEnv);
    expect(cfg.extraHeaders).toEqual({
      'HTTP-Referer': 'https://example.com',
      'X-Title': 'My App',
    });
  });

  it('uses Together stop word for Llama-3', () => {
    const cfg = getLLMConfig({ TOGETHER_API_KEY: 't' } as LLMEnv);
    expect(cfg.provider).toBe('together');
    expect(cfg.stopWords).toContain('<|eot_id|>');
  });
});
