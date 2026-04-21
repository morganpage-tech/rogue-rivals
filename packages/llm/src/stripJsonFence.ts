/** Strip ```json fences from model output (tools/llm_client.py). */
export function stripJsonFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (m) return m[1]!.trim();
  return t;
}
