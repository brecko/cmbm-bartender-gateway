import { Request, Response } from 'express';
import { OllamaClient } from '../services/ollama-client.js';
import { TieredOllamaRouter } from '../services/tiered-ollama-router.js';
import { MCPClient } from '../services/mcp-client.js';
import axios from 'axios';

const ollamaClient = new OllamaClient();
const tieredRouter = new TieredOllamaRouter();
const mcpClient = new MCPClient();

const MAIN_APP_URL = process.env.MAIN_APP_URL || 'http://cmbm-main:3000';

interface ChatRequest {
  familyId: string;
  userId: string;
  message: string;
  sessionId?: string;
  measurementSystem: 'imperial' | 'metric' | 'both'; // REQUIRED for localized responses
}

export class ChatController {
  /**
   * Send a chat message to the Mixologist AI
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { familyId, userId, message, sessionId, measurementSystem }: ChatRequest = req.body;

      // Validate required fields
      if (!familyId || !userId || !message) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: familyId, userId, message',
        });
        return;
      }

      // Validate measurementSystem is provided and valid
      if (!measurementSystem || !['imperial', 'metric', 'both'].includes(measurementSystem)) {
        res.status(400).json({
          success: false,
          message: 'Missing or invalid measurementSystem. Must be one of: imperial, metric, both',
        });
        return;
      }

      // Generate or use existing session ID
      const activeSessionId = sessionId || this.generateSessionId();

      // Store user message in MCP
      await mcpClient.storeMessage({
        familyId,
        userId,
        sessionId: activeSessionId,
        role: 'user',
        content: message,
      });

      // Build enriched context from MCP (conversation history, preferences, inventory)
      const mcpContext = await mcpClient.buildContext(familyId, userId, activeSessionId);

      // Detect if question requires inventory or recipe lookup
      const needsInventoryCheck = this.detectInventoryQuery(message);
      const needsRecipeLookup = this.detectRecipeQuery(message);

      let additionalContext = '';

      // Call MCP tools if needed for additional context
      if (needsInventoryCheck) {
        const ingredient = this.extractIngredient(message);
        if (ingredient) {
          const inventoryResult = await mcpClient.checkInventory(familyId, ingredient);
          if (inventoryResult && !inventoryResult.message) {
            additionalContext += `\nInventory Check: ${JSON.stringify(inventoryResult)}`;
          }
        }
      }

      if (needsRecipeLookup) {
        const ingredients = this.extractIngredients(message);
        const recipeResult = await mcpClient.findRecipes(familyId, ingredients);
        if (recipeResult && recipeResult.recipes) {
            additionalContext += `\nAvailable Recipes: ${JSON.stringify(recipeResult)}`;
        }
      }

      // Combine all context
      const fullContext = [mcpContext, additionalContext].filter((c) => c).join('\n\n');

      // Fetch family subscription tier from main app
      const subscriptionTier = await this.getFamilySubscriptionTier(familyId);

      // Generate response with Ollama using tiered routing (measurement system is now required)
      console.log(`[Chat] Generating response for user ${userId} in family ${familyId} (tier: ${subscriptionTier.tier}, locale: ${measurementSystem})`);
      
      const result = await tieredRouter.generate(
        message,
        familyId,
        subscriptionTier,
        fullContext,
        measurementSystem
      );

      console.log(`[Chat] Response generated via ${result.instanceType.toUpperCase()} (cost: $${result.estimatedCost.toFixed(6)})`);

      // Store assistant response in MCP
      await mcpClient.storeMessage({
        familyId,
        userId,
        sessionId: activeSessionId,
        role: 'assistant',
        content: result.response,
      });

      res.json({
        success: true,
        message: result.response,
        sessionId: activeSessionId,
        conversationId: activeSessionId,
        context: fullContext ? 'enriched' : 'basic',
        metadata: {
          tier: subscriptionTier.tier,
          instanceType: result.instanceType,
          estimatedCost: result.estimatedCost,
        },
      });
    } catch (error) {
      console.error('[Chat] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      res.status(500).json({
        success: false,
        message: 'Failed to process chat message',
        error: errorMessage,
      });
    }
  }

  /**
   * Get chat sessions for a family
   */
  async getSessions(req: Request, res: Response): Promise<void> {
    try {
      const { familyId } = req.query;

      if (!familyId) {
        res.status(400).json({
          success: false,
          message: 'Missing required parameter: familyId',
        });
        return;
      }

      // TODO: Fetch sessions from database
      // For now, return empty array
      res.json({
        success: true,
        sessions: [],
      });
    } catch (error) {
      console.error('[Sessions] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch chat sessions',
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const ollamaHealth = await ollamaClient.healthCheck();
      const mcpHealth = await mcpClient.healthCheck();

      const allHealthy = ollamaHealth.healthy && mcpHealth.healthy;

      if (!allHealthy) {
        res.status(503).json({
          status: 'unhealthy',
          services: {
            ollama: {
              healthy: ollamaHealth.healthy,
              error: ollamaHealth.error,
              model: ollamaHealth.model,
            },
            mcp: {
              healthy: mcpHealth.healthy,
              error: mcpHealth.error,
            },
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.json({
        status: 'healthy',
        services: {
          ollama: {
            healthy: true,
            model: ollamaHealth.model,
          },
          mcp: {
            healthy: true,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get LLM information endpoint (for main app system controller)
   * Returns user-friendly info for frontend + detailed analytics for backend monitoring
   */
  async getLLMInfo(req: Request, res: Response): Promise<void> {
    try {
      const health = await ollamaClient.healthCheck();
      const modelInfo = await ollamaClient.getModelInfo();
      
      // Format version as human-readable date (e.g., "November 2025")
      const buildDate = new Date();
      const versionDate = buildDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      res.json({
        // User-facing information (displayed in frontend)
        displayName: 'Mixologist',
        version: versionDate,
        status: health.healthy ? 'available' : 'unavailable',
        capabilities: ['chat', 'cocktail-recommendations', 'recipe-analysis', 'party-planning'],
        
        // Backend analytics information (for monitoring/debugging)
        analytics: {
          provider: 'ollama',
          providerType: 'local',
          modelName: health.model || 'cocktail-bartender:latest',
          modelSize: modelInfo?.details?.parameter_size || 'unknown',
          quantization: modelInfo?.details?.quantization_level || 'unknown',
          responseTime: modelInfo?.details?.family || 'llama',
          lastHealthCheck: new Date().toISOString(),
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
        },
        
        lastUpdate: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        displayName: 'Mixologist',
        version: 'Unavailable',
        status: 'unavailable',
        capabilities: [],
        analytics: {
          provider: 'ollama',
          providerType: 'local',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        lastUpdate: new Date().toISOString(),
      });
    }
  }

  /**
   * Get inventory context from main app (TODO: implement)
   */
  private async getInventoryContext(familyId: string): Promise<string> {
    // TODO: Fetch from main app API
    // For now, return empty context
    return '';
  }

  /**
   * Get family subscription tier from main app
   */
  private async getFamilySubscriptionTier(familyId: string): Promise<{
    tier: 'free' | 'premium';
    subscriptionActive: boolean;
  }> {
    try {
      const response = await axios.get(`${MAIN_APP_URL}/v1/api/cmbm-main/families/${familyId}/subscription`, {
        timeout: 5000,
      });

      return {
        tier: response.data.subscriptionTier || 'free',
        subscriptionActive: response.data.subscriptionActive !== false,
      };
    } catch (error) {
      console.warn(`[Chat] Failed to fetch subscription tier for family ${familyId}, defaulting to free tier`);
      // Default to free tier on error
      return {
        tier: 'free',
        subscriptionActive: true,
      };
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Detect if message is asking about inventory
   */
  private detectInventoryQuery(message: string): boolean {
    const inventoryKeywords = [
      'do i have',
      'do we have',
      'is there',
      'check inventory',
      'check stock',
      'in stock',
      'available',
      'how much',
      'enough',
    ];
    const lowerMessage = message.toLowerCase();
    return inventoryKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Detect if message is asking about recipes
   */
  private detectRecipeQuery(message: string): boolean {
    const recipeKeywords = [
      'recipe',
      'cocktail',
      'drink',
      'make',
      'mix',
      'what can i make',
      'suggest',
      'recommend',
    ];
    const lowerMessage = message.toLowerCase();
    return recipeKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Extract ingredient from message (simple extraction)
   */
  private extractIngredient(message: string): string | null {
    // Simple extraction - look for words after "do i have" or "do we have"
    const patterns = [
      /do\s+(?:i|we)\s+have\s+(?:any\s+)?(\w+)/i,
      /is\s+there\s+(?:any\s+)?(\w+)/i,
      /check\s+(?:for\s+)?(\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    }

    return null;
  }

  /**
   * Extract ingredients from message (simple extraction)
   */
  private extractIngredients(message: string): string[] {
    // Extract words that might be ingredients (simple approach)
    const words = message.toLowerCase().split(/\s+/);
    const commonWords = new Set([
      'what',
      'can',
      'i',
      'make',
      'with',
      'using',
      'have',
      'got',
      'the',
      'a',
      'an',
      'and',
      'or',
    ]);

    return words.filter((word) => word.length > 3 && !commonWords.has(word));
  }
}
