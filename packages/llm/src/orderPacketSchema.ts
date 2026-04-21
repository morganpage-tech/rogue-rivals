/** JSON Schema for LLM order packet (tools/v2/llm_agent.py ORDER_PACKET_SCHEMA). */
export const ORDER_PACKET_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    choose: {
      type: "array",
      maxItems: 12,
      items: { type: "string" },
    },
    messages: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        required: ["to", "text"],
        additionalProperties: true,
        properties: {
          to: { type: "string" },
          text: { type: "string" },
        },
      },
    },
    orders: { type: "array", maxItems: 12 },
  },
} as const;
