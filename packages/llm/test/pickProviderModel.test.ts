import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { pickProviderModel, LLMError } from "../src/llmClient.js";

describe("pickProviderModel", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when no API keys are set", () => {
    expect(() => pickProviderModel(undefined, undefined)).toThrow(LLMError);
    expect(() => pickProviderModel(undefined, undefined)).toThrow("No LLM API key configured");
  });

  it("selects anthropic when key is present", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("anthropic");
    expect(result.anthropicPreference).toBe(true);
  });

  it("selects zai when anthropic key is absent", () => {
    process.env.ZAI_API_KEY = "test-key";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("zai");
  });

  it("selects openai when no anthropic or zai", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("openai");
  });

  it("selects openrouter when no anthropic/zai/openai", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("openrouter");
  });

  it("selects groq when no other keys", () => {
    process.env.GROQ_API_KEY = "test-key";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("groq");
  });

  it("uses explicit provider when key is available", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const result = pickProviderModel("openai", undefined);
    expect(result.provider).toBe("openai");
  });

  it("throws when explicit provider key is missing", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(() => pickProviderModel("openai", undefined)).toThrow("OPENAI_API_KEY is not set");
  });

  it("uses LLM_PROVIDER env var", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "anthropic";
    const result = pickProviderModel(undefined, undefined);
    expect(result.provider).toBe("anthropic");
  });

  it("throws for unknown provider", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(() => pickProviderModel("unknown_provider", undefined)).toThrow("Unknown provider");
  });

  it("uses explicit model override", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = pickProviderModel("anthropic", "my-custom-model");
    expect(result.model).toBe("my-custom-model");
  });

  it("uses default model for anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const result = pickProviderModel("anthropic", undefined);
    expect(result.model).toBe("claude-3-5-haiku-20241022");
  });

  it("uses ANTHROPIC_MODEL env var", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-custom";
    const result = pickProviderModel("anthropic", undefined);
    expect(result.model).toBe("claude-custom");
  });

  it("uses ZAI_KEY alias", () => {
    process.env.ZAI_KEY = "test-key";
    const result = pickProviderModel("zai", undefined);
    expect(result.provider).toBe("zai");
  });

  it("uses default groq model", () => {
    process.env.GROQ_API_KEY = "test-key";
    const result = pickProviderModel("groq", undefined);
    expect(result.model).toBe("llama-3.3-70b-versatile");
  });
});
