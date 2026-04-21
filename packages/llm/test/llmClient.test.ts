import { afterEach, describe, expect, it, vi } from "vitest";

import { assertLlmEnvironmentConfigured, LLMError } from "../src/llmClient.js";

function stubNoLlmKeys(): void {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ZAI_API_KEY", "");
  vi.stubEnv("ZAI_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("LLM_PROVIDER", "");
}

describe("assertLlmEnvironmentConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when no LLM API keys are set", () => {
    stubNoLlmKeys();
    expect(() => assertLlmEnvironmentConfigured()).toThrow(LLMError);
    expect(() => assertLlmEnvironmentConfigured()).toThrow(/No LLM API key configured/);
  });

  it("does not throw when at least one provider key is set", () => {
    stubNoLlmKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(() => assertLlmEnvironmentConfigured()).not.toThrow();
  });

  it("throws when LLM_PROVIDER requires a missing key", () => {
    stubNoLlmKeys();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("LLM_PROVIDER", "openai");
    expect(() => assertLlmEnvironmentConfigured()).toThrow(/OPENAI_API_KEY is not set/);
  });
});
