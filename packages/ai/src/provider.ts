export type AiProvider = {
  generateJson<T>(input: { system: string; prompt: string; fallback: T }): Promise<T>;
};

export function createAiProvider(): AiProvider {
  return {
    async generateJson<T>({ system, prompt, fallback }: { system: string; prompt: string; fallback: T }): Promise<T> {
      const apiKey = process.env.FIREWORKS_API_KEY;
      if (!apiKey) {
        return fallback;
      }

      try {
        const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: process.env.FIREWORKS_MODEL ?? "accounts/fireworks/models/deepseek-v3p1",
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 1200,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt }
            ]
          })
        });

        if (!response.ok) {
          return fallback;
        }

        const json = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (!content) {
          return fallback;
        }

        return JSON.parse(content) as T;
      } catch {
        return fallback;
      }
    }
  };
}
