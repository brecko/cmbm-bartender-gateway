import axios from 'axios';

/**
 * Tiered Ollama Router
 * 
 * Routes requests to CPU or GPU Ollama instances based on family subscription tier.
 * - Free tier: CPU instance (slow but cheap)
 * - Premium tier: GPU instance (fast but expensive)
 */

interface SubscriptionTier {
  tier: 'free' | 'premium';
  subscriptionActive: boolean;
}

interface OllamaInstance {
  baseUrl: string;
  model: string;
  type: 'cpu' | 'gpu';
  available: boolean;
}

export class TieredOllamaRouter {
  private cpuInstance: OllamaInstance;
  private gpuInstance: OllamaInstance | null;

  constructor() {
    // CPU instance (always available, cheap hosting ~$20-40/month)
    this.cpuInstance = {
      baseUrl: process.env.OLLAMA_CPU_BASE_URL || 'http://ollama-cpu:11434',
      model: process.env.OLLAMA_MODEL || 'cocktail-bartender:latest',
      type: 'cpu',
      available: true,
    };

    // GPU instance (expensive, only provision when needed ~$150-300/month)
    this.gpuInstance = process.env.OLLAMA_GPU_BASE_URL
      ? {
          baseUrl: process.env.OLLAMA_GPU_BASE_URL,
          model: process.env.OLLAMA_MODEL || 'cocktail-bartender:latest',
          type: 'gpu',
          available: false, // Check health on startup
        }
      : null;

    // Check GPU availability on startup
    if (this.gpuInstance) {
      this.checkGPUAvailability();
    }
  }

  /**
   * Route request to appropriate Ollama instance based on subscription tier
   */
  async generate(
    prompt: string,
    familyId: string,
    subscriptionTier: SubscriptionTier,
    context?: string,
    measurementSystem?: 'imperial' | 'metric' | 'both'
  ): Promise<{ response: string; instanceType: 'cpu' | 'gpu'; estimatedCost: number }> {
    const systemPrompt = this.buildSystemPrompt(prompt, context, measurementSystem);

    // Determine which instance to use
    const instance = this.selectInstance(subscriptionTier);

    console.log(
      `🎯 Routing familyId=${familyId} (tier=${subscriptionTier.tier}) to ${instance.type.toUpperCase()} instance`
    );

    try {
      const startTime = Date.now();

      const response = await axios.post(
        `${instance.baseUrl}/api/generate`,
        {
          model: instance.model,
          prompt: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
        },
        {
          timeout: instance.type === 'cpu' ? 90000 : 30000, // 90s for CPU, 30s for GPU
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;

      // Calculate estimated cost (illustrative)
      const estimatedCost = instance.type === 'gpu' ? 0.0001 : 0.00001; // GPU: $0.30/hour, CPU: $0.03/hour

      console.log(
        `✅ Response from ${instance.type.toUpperCase()} in ${duration}ms (cost: $${estimatedCost.toFixed(6)})`
      );

      return {
        response: response.data.response,
        instanceType: instance.type,
        estimatedCost,
      };
    } catch (error: any) {
      // If GPU fails, fallback to CPU for premium users
      if (instance.type === 'gpu' && this.cpuInstance.available) {
        console.warn(`⚠️  GPU instance failed, falling back to CPU for familyId=${familyId}`);
        return this.generateOnCPU(systemPrompt, familyId);
      }

      throw error;
    }
  }

  /**
   * Select appropriate Ollama instance based on subscription tier
   */
  private selectInstance(subscriptionTier: SubscriptionTier): OllamaInstance {
    // Premium tier with active subscription → Try GPU first
    if (
      subscriptionTier.tier === 'premium' &&
      subscriptionTier.subscriptionActive &&
      this.gpuInstance?.available
    ) {
      return this.gpuInstance;
    }

    // Free tier or GPU unavailable → Use CPU
    return this.cpuInstance;
  }

  /**
   * Generate response on CPU instance (fallback)
   */
  private async generateOnCPU(systemPrompt: string, familyId: string): Promise<any> {
    const response = await axios.post(
      `${this.cpuInstance.baseUrl}/api/generate`,
      {
        model: this.cpuInstance.model,
        prompt: systemPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        },
      },
      {
        timeout: 90000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      response: response.data.response,
      instanceType: 'cpu',
      estimatedCost: 0.00001,
    };
  }

  /**
   * Build system prompt with context and measurement preference
   */
  private buildSystemPrompt(
    prompt: string,
    context?: string,
    measurementSystem?: 'imperial' | 'metric' | 'both'
  ): string {
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
   * Check if GPU instance is available
   */
  private async checkGPUAvailability(): Promise<void> {
    if (!this.gpuInstance) return;

    try {
      const response = await axios.get(`${this.gpuInstance.baseUrl}/api/tags`, {
        timeout: 5000,
      });

      const models = response.data.models || [];
      const modelAvailable = models.some((m: any) => m.name === this.gpuInstance?.model);

      this.gpuInstance.available = modelAvailable;

      console.log(
        `🖥️  GPU instance ${this.gpuInstance.available ? 'AVAILABLE' : 'UNAVAILABLE'} at ${this.gpuInstance.baseUrl}`
      );
    } catch (error) {
      this.gpuInstance.available = false;
      console.warn(`⚠️  GPU instance unavailable: ${(error as Error).message}`);
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    cpuAvailable: boolean;
    gpuAvailable: boolean;
    gpuProvisioned: boolean;
  } {
    return {
      cpuAvailable: this.cpuInstance.available,
      gpuAvailable: this.gpuInstance?.available || false,
      gpuProvisioned: this.gpuInstance !== null,
    };
  }

  /**
   * Health check for admin dashboard
   */
  async healthCheck(): Promise<{
    cpu: { available: boolean; baseUrl: string };
    gpu: { available: boolean; baseUrl: string | null; provisioned: boolean };
  }> {
    // Re-check GPU availability
    if (this.gpuInstance) {
      await this.checkGPUAvailability();
    }

    return {
      cpu: {
        available: this.cpuInstance.available,
        baseUrl: this.cpuInstance.baseUrl,
      },
      gpu: {
        available: this.gpuInstance?.available || false,
        baseUrl: this.gpuInstance?.baseUrl || null,
        provisioned: this.gpuInstance !== null,
      },
    };
  }
}
