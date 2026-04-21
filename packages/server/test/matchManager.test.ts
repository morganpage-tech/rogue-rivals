import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreateMatchRequest } from "@rr/shared";

import { MatchManager } from "../src/match/matchManager.js";

function stubNoLlmKeys(): void {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ZAI_API_KEY", "");
  vi.stubEnv("ZAI_KEY", "");
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("LLM_PROVIDER", "");
}

describe("MatchManager", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates an autoPlay match when all slots are non-human", () => {
    const mgr = new MatchManager();
    const tribes = ["orange", "grey", "brown", "red"] as const;
    const req: CreateMatchRequest = {
      mapPreset: "hand_minimal",
      tribes: [...tribes],
      slots: tribes.map((tribe) => ({
        tribe,
        type: "pass" as const,
      })),
      tickLimit: 5,
    };
    const res = mgr.createMatch(req);
    expect(res.autoPlay).toBe(true);
    expect(res.matchId.length).toBeGreaterThan(10);
    const m = mgr.getMatch(res.matchId);
    expect(m?.autoPlay).toBe(true);
  });

  it("fails fast on createMatch when an LLM slot is configured but no API keys are set", () => {
    stubNoLlmKeys();
    const mgr = new MatchManager();
    const tribes = ["orange", "grey", "brown", "red"] as const;
    const req: CreateMatchRequest = {
      mapPreset: "hand_minimal",
      tribes: [...tribes],
      slots: tribes.map((tribe) =>
        tribe === "orange"
          ? { tribe, type: "llm" as const, llmConfig: { persona: "warlord" } }
          : { tribe, type: "pass" as const },
      ),
      tickLimit: 5,
    };
    expect(() => mgr.createMatch(req)).toThrow(/No LLM API key configured/);
  });

  it("allows spectator REST for non-autoPlay matches", () => {
    const mgr = new MatchManager();
    const tribes = ["orange", "grey", "brown", "red"] as const;
    const req: CreateMatchRequest = {
      mapPreset: "hand_minimal",
      tribes: [...tribes],
      slots: tribes.map((tribe) => ({
        tribe,
        type: tribe === "orange" ? ("human" as const) : ("pass" as const),
      })),
    };
    const res = mgr.createMatch(req);
    expect(res.autoPlay).toBe(false);
    expect(mgr.getSpectatorView(res.matchId)).not.toBeNull();
  });
});
