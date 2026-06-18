export type AiProvider = {
  generateJson<T>(input: { system: string; prompt: string; fallback: T }): Promise<T>;
};

export function createAiProvider(): AiProvider {
  return {
    async generateJson({ fallback }) {
      return fallback;
    }
  };
}
