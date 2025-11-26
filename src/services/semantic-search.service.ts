import axios from "axios";
import { Ollama } from "ollama";

/**
 * Semantic Search Service
 * Provides semantic search capabilities for recipes and ingredients
 * using local Ollama embeddings and vector similarity
 */

interface SearchResult {
  id: string;
  name: string;
  similarity: number;
  metadata: {
    category?: string;
    glass?: string;
    alcoholic?: string;
    ingredientCount?: number;
    family?: string;
    usageCount?: number;
  };
}

interface VectorSearchResponse {
  ids: string[];
  distances: number[];
  documents: string[];
  metadatas: any[];
  similarities: number[];
}

export class SemanticSearchService {
  private ollama: Ollama;
  private ollamaHost: string;
  private embeddingModel: string;
  private vectorDbPath: string;
  private recipeCache: Map<string, any[]> = new Map();
  private ingredientCache: Map<string, any[]> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.ollamaHost = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    this.embeddingModel = process.env.EMBEDDING_MODEL || "nomic-embed-text";
    this.vectorDbPath =
      process.env.VECTOR_DB_PATH || "../cmbm-recipe-data/vector_db";
    this.ollama = new Ollama({ host: this.ollamaHost });

    console.log("[SemanticSearch] Initialized with:", {
      ollamaHost: this.ollamaHost,
      embeddingModel: this.embeddingModel,
      vectorDbPath: this.vectorDbPath,
    });
  }

  /**
   * Generate embedding for a text query
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.ollama.embeddings({
        model: this.embeddingModel,
        prompt: text,
      });
      return response.embedding;
    } catch (error) {
      console.error("[SemanticSearch] Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Load vector database from JSON files
   */
  private async loadVectorDb(
    collection: "recipes" | "ingredients"
  ): Promise<any[]> {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const filePath = path.join(this.vectorDbPath, `${collection}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      console.error(`[SemanticSearch] Error loading ${collection}:`, error);
      throw new Error(`Failed to load ${collection} database`);
    }
  }

  /**
   * Search recipes by semantic query
   */
  async searchRecipes(
    query: string,
    limit: number = 10,
    filter?: { category?: string; alcoholic?: string }
  ): Promise<SearchResult[]> {
    // Check cache
    const cacheKey = `${query}-${limit}-${JSON.stringify(filter || {})}`;
    if (this.recipeCache.has(cacheKey)) {
      const cached = this.recipeCache.get(cacheKey);
      console.log("[SemanticSearch] Cache hit for recipe query:", query);
      return cached!;
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Load recipes
    const recipes = await this.loadVectorDb("recipes");

    // Calculate similarities
    let results = recipes.map((recipe) => ({
      ...recipe,
      similarity: this.cosineSimilarity(queryEmbedding, recipe.embedding),
    }));

    // Apply filters
    if (filter) {
      results = results.filter((r) => {
        if (filter.category && r.metadata.category !== filter.category)
          return false;
        if (
          filter.alcoholic !== undefined &&
          r.metadata.alcoholic !== filter.alcoholic
        )
          return false;
        return true;
      });
    }

    // Sort by similarity and take top N
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Format results
    const formattedResults: SearchResult[] = topResults.map((r) => ({
      id: r.id,
      name: r.metadata.name,
      similarity: Math.round(r.similarity * 1000) / 10, // Convert to percentage
      metadata: {
        category: r.metadata.category,
        glass: r.metadata.glass,
        alcoholic: r.metadata.alcoholic,
        ingredientCount: r.metadata.ingredientCount,
      },
    }));

    // Cache results
    this.recipeCache.set(cacheKey, formattedResults);
    setTimeout(() => this.recipeCache.delete(cacheKey), this.cacheTimeout);

    return formattedResults;
  }

  /**
   * Search ingredients by semantic query
   */
  async searchIngredients(
    query: string,
    limit: number = 10,
    filter?: { category?: string; family?: string }
  ): Promise<SearchResult[]> {
    // Check cache
    const cacheKey = `${query}-${limit}-${JSON.stringify(filter || {})}`;
    if (this.ingredientCache.has(cacheKey)) {
      const cached = this.ingredientCache.get(cacheKey);
      console.log("[SemanticSearch] Cache hit for ingredient query:", query);
      return cached!;
    }

    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);

    // Load ingredients
    const ingredients = await this.loadVectorDb("ingredients");

    // Calculate similarities
    let results = ingredients.map((ingredient) => ({
      ...ingredient,
      similarity: this.cosineSimilarity(queryEmbedding, ingredient.embedding),
    }));

    // Apply filters
    if (filter) {
      results = results.filter((i) => {
        if (filter.category && i.metadata.category !== filter.category)
          return false;
        if (filter.family && i.metadata.family !== filter.family) return false;
        return true;
      });
    }

    // Sort by similarity and take top N
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    // Format results
    const formattedResults: SearchResult[] = topResults.map((i) => ({
      id: i.id,
      name: i.metadata.name,
      similarity: Math.round(i.similarity * 1000) / 10,
      metadata: {
        category: i.metadata.category,
        family: i.metadata.family,
        usageCount: i.metadata.usageCount,
      },
    }));

    // Cache results
    this.ingredientCache.set(cacheKey, formattedResults);
    setTimeout(() => this.ingredientCache.delete(cacheKey), this.cacheTimeout);

    return formattedResults;
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{ status: string; details: any }> {
    try {
      // Check Ollama connection
      const models = await this.ollama.list();
      const hasModel = models.models.some((m) =>
        m.name.includes(this.embeddingModel)
      );

      // Check vector database
      const recipes = await this.loadVectorDb("recipes");
      const ingredients = await this.loadVectorDb("ingredients");

      return {
        status: "healthy",
        details: {
          ollama: {
            connected: true,
            host: this.ollamaHost,
            model: this.embeddingModel,
            available: hasModel,
          },
          vectorDb: {
            recipes: recipes.length,
            ingredients: ingredients.length,
          },
          cache: {
            recipeQueries: this.recipeCache.size,
            ingredientQueries: this.ingredientCache.size,
          },
        },
      };
    } catch (error: any) {
      return {
        status: "unhealthy",
        details: {
          error: error.message,
        },
      };
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.recipeCache.clear();
    this.ingredientCache.clear();
    console.log("[SemanticSearch] Cache cleared");
  }
}

export const semanticSearchService = new SemanticSearchService();
