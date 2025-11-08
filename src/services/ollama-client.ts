import axios, { AxiosError } from 'axios';

interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'cocktail-bartender:latest';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10);
  }

  /**
   * Generate a response from the Ollama model
   */
  async generate(prompt: string, context?: string, measurementSystem?: 'imperial' | 'metric' | 'both'): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(prompt, context, measurementSystem);

    try {
      const response = await axios.post<OllamaResponse>(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          prompt: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
        } as OllamaRequest,
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.response;
    } catch (error) {
      this.handleError(error);
      throw error; // TypeScript knows this won't be reached
    }
  }

  /**
   * Build system prompt with context and measurement preference
   */
  private buildSystemPrompt(prompt: string, context?: string, measurementSystem?: 'imperial' | 'metric' | 'both'): string {
    let basePrompt = `You are a professional mixologist and cocktail expert. You have deep knowledge of:
- Classic and modern cocktail recipes
- Spirits, liqueurs, and mixers
- Flavor profiles and ingredient pairings
- Cocktail techniques and presentation
- Bar equipment and glassware

Provide helpful, accurate, and engaging responses. Be concise but informative.`;

    // Add measurement system instruction
    if (measurementSystem === 'imperial') {
      basePrompt += `\n\nIMPORTANT: Provide all measurements in imperial units (oz, cups, tablespoons, teaspoons). Example: "2 oz vodka, 1 oz lime juice, 1 tsp sugar".`;
    } else if (measurementSystem === 'both') {
      basePrompt += `\n\nIMPORTANT: Provide all measurements in both metric and imperial units. Example: "60 ml / 2 oz vodka, 30 ml / 1 oz lime juice, 5 ml / 1 tsp sugar".`;
    } else {
      // Default to metric
      basePrompt += `\n\nIMPORTANT: Provide all measurements in metric units (ml, cl, l, g). Example: "60 ml vodka, 30 ml lime juice, 5 ml sugar syrup".`;
    }

    if (context) {
      return `${basePrompt}\n\nContext: ${context}\n\nUser: ${prompt}\n\nMixologist:`;
    }

    return `${basePrompt}\n\nUser: ${prompt}\n\nMixologist:`;
  }

  /**
   * Check if Ollama service is healthy and model is available
   */
  async healthCheck(): Promise<{ healthy: boolean; model?: string; error?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
      });

      // Check if our model is available
      const models = response.data.models || [];
      const modelAvailable = models.some((m: any) => m.name === this.model);

      if (!modelAvailable) {
        return {
          healthy: false,
          error: `Model '${this.model}' not found. Available models: ${models.map((m: any) => m.name).join(', ')}`,
        };
      }

      return { healthy: true, model: this.model };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        healthy: false,
        error: `Ollama service unavailable: ${axiosError.message}`,
      };
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/show`,
        { name: this.model },
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      console.error('Failed to get model info:', error);
      return null;
    }
  }

  /**
   * Handle Ollama API errors
   */
  private handleError(error: unknown): never {
    const axiosError = error as AxiosError;

    if (axiosError.code === 'ECONNREFUSED') {
      throw new Error(
        `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`
      );
    }

    if (axiosError.code === 'ETIMEDOUT') {
      throw new Error(
        `Ollama request timed out after ${this.timeout}ms. The model may be too slow or overloaded.`
      );
    }

    if (axiosError.response) {
      throw new Error(
        `Ollama API error (${axiosError.response.status}): ${JSON.stringify(axiosError.response.data)}`
      );
    }

    throw new Error(`Ollama error: ${axiosError.message}`);
  }
}
