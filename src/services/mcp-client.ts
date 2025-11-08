/**
 * MCP Client for Bartender Gateway
 * 
 * Communicates with the MCP Server to:
 * - Retrieve conversation history
 * - Call tools (check_inventory, find_recipes, etc.)
 * - Access resources (inventory, recipes, preferences)
 * - Store conversation messages
 */

import axios, { AxiosError } from 'axios';

interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

interface MCPResource {
  uri: string;
  contents: Array<{
    uri: string;
    mimeType: string;
    text: string;
  }>;
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, any>;
    result?: any;
  }>;
}

export class MCPClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.MCP_SERVER_URL || 'http://localhost:3100';
  }

  /**
   * Call an MCP tool
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    try {
      const response = await axios.post<MCPToolResult>(
        `${this.baseUrl}/api/tools/call`,
        {
          name,
          arguments: args,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      // Parse the JSON response from the tool
      const resultText = response.data.content[0]?.text;
      return resultText ? JSON.parse(resultText) : null;
    } catch (error) {
      console.error(`[MCP] Tool call failed: ${name}`, error);
      return null;
    }
  }

  /**
   * Read an MCP resource
   */
  async readResource(uri: string): Promise<any> {
    try {
      const response = await axios.post<MCPResource>(
        `${this.baseUrl}/api/resources/read`,
        { uri },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }
      );

      // Parse the JSON response from the resource
      const resourceText = response.data.contents[0]?.text;
      return resourceText ? JSON.parse(resourceText) : null;
    } catch (error) {
      console.error(`[MCP] Resource read failed: ${uri}`, error);
      return null;
    }
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(
    familyId: string,
    sessionId: string,
    limit: number = 10
  ): Promise<ConversationMessage[]> {
    try {
      const uri = `conversations://session/${sessionId}@${familyId}`;
      const data = await this.readResource(uri);
      return data?.messages || [];
    } catch (error) {
      console.error('[MCP] Failed to get session history', error);
      return [];
    }
  }

  /**
   * Store a conversation message
   */
  async storeMessage(message: {
    familyId: string;
    userId: string;
    sessionId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: any[];
  }): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/api/conversations/store`,
        message,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        }
      );
    } catch (error) {
      console.error('[MCP] Failed to store message', error);
    }
  }

  /**
   * Check inventory for an ingredient
   */
  async checkInventory(familyId: string, ingredient: string): Promise<any> {
    return await this.callTool('check_inventory', {
      familyId,
      ingredient,
    });
  }

  /**
   * Find recipes by ingredients
   */
  async findRecipes(
    familyId: string,
    ingredients: string[],
    category?: string
  ): Promise<any> {
    return await this.callTool('find_recipes', {
      familyId,
      ingredients,
      category,
    });
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(familyId: string, userId: string): Promise<any> {
    const uri = `preferences://user/${userId}@${familyId}`;
    return await this.readResource(uri);
  }

  /**
   * Get family inventory
   */
  async getInventory(familyId: string): Promise<any> {
    const uri = `inventory://family/${familyId}/ingredients`;
    return await this.readResource(uri);
  }

  /**
   * Store user preference
   */
  async storePreference(
    familyId: string,
    userId: string,
    preferenceType: string,
    value: string
  ): Promise<void> {
    await this.callTool('store_preference', {
      familyId,
      userId,
      preferenceType,
      value,
    });
  }

  /**
   * Build enriched context for Ollama
   * 
   * Combines conversation history, inventory, and preferences
   */
  async buildContext(
    familyId: string,
    userId: string,
    sessionId: string
  ): Promise<string> {
    const contextParts: string[] = [];

    try {
      // Get conversation history (last 5 messages)
      const history = await this.getSessionHistory(familyId, sessionId, 5);
      if (history.length > 0) {
        const historyText = history
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join('\n');
        contextParts.push(`Recent Conversation:\n${historyText}`);
      }

      // Get user preferences
      const preferences = await this.getUserPreferences(familyId, userId);
      if (preferences && !preferences.message) {
        const prefParts: string[] = [];
        if (preferences.favoriteDrinks?.length > 0) {
          prefParts.push(`Favorite Drinks: ${preferences.favoriteDrinks.join(', ')}`);
        }
        if (preferences.preferredSpirits?.length > 0) {
          prefParts.push(`Preferred Spirits: ${preferences.preferredSpirits.join(', ')}`);
        }
        if (preferences.dietaryRestrictions?.length > 0) {
          prefParts.push(`Dietary Restrictions: ${preferences.dietaryRestrictions.join(', ')}`);
        }
        if (preferences.experienceLevel) {
          prefParts.push(`Experience Level: ${preferences.experienceLevel}`);
        }
        if (prefParts.length > 0) {
          contextParts.push(`User Preferences:\n${prefParts.join('\n')}`);
        }
      }

      // Get inventory
      const inventory = await this.getInventory(familyId);
      if (inventory && inventory.ingredients) {
        const ingredientList = inventory.ingredients
          .map((ing: any) => `${ing.name} (${ing.volumeRemaining}${ing.unit})`)
          .join(', ');
        contextParts.push(`Available Ingredients:\n${ingredientList}`);
      }
    } catch (error) {
      console.error('[MCP] Error building context:', error);
    }

    return contextParts.join('\n\n');
  }

  /**
   * Health check for MCP server
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 3000,
      });
      return { healthy: response.status === 200 };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        healthy: false,
        error: `MCP Server unavailable: ${axiosError.message}`,
      };
    }
  }
}
