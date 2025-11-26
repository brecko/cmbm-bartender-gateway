import { Request, Response, Router } from "express";
import { semanticSearchService } from "../services/semantic-search.service.js";

const router = Router();

/**
 * POST /api/search/recipes
 * Search recipes by semantic query
 *
 * Body:
 * {
 *   "query": "fruity tropical drinks",
 *   "limit": 10,
 *   "filter": { "category": "Cocktail", "alcoholic": "Alcoholic" }
 * }
 */
router.post("/recipes", async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, filter } = req.body;

    // Validation
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query parameter is required and must be a string",
      });
    }

    if (query.length < 3) {
      return res.status(400).json({
        error: "Query must be at least 3 characters long",
      });
    }

    if (limit < 1 || limit > 50) {
      return res.status(400).json({
        error: "Limit must be between 1 and 50",
      });
    }

    console.log("[SearchController] Recipe search:", { query, limit, filter });

    const results = await semanticSearchService.searchRecipes(
      query,
      limit,
      filter
    );

    res.json({
      query,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error("[SearchController] Error searching recipes:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * POST /api/search/ingredients
 * Search ingredients by semantic query
 *
 * Body:
 * {
 *   "query": "vodka alternatives",
 *   "limit": 10,
 *   "filter": { "category": "Spirits", "family": "Vodka Family" }
 * }
 */
router.post("/ingredients", async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, filter } = req.body;

    // Validation
    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query parameter is required and must be a string",
      });
    }

    if (query.length < 3) {
      return res.status(400).json({
        error: "Query must be at least 3 characters long",
      });
    }

    if (limit < 1 || limit > 50) {
      return res.status(400).json({
        error: "Limit must be between 1 and 50",
      });
    }

    console.log("[SearchController] Ingredient search:", {
      query,
      limit,
      filter,
    });

    const results = await semanticSearchService.searchIngredients(
      query,
      limit,
      filter
    );

    res.json({
      query,
      count: results.length,
      results,
    });
  } catch (error: any) {
    console.error("[SearchController] Error searching ingredients:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

/**
 * GET /api/search/health
 * Check semantic search service health
 */
router.get("/health", async (req: Request, res: Response) => {
  try {
    const health = await semanticSearchService.getHealth();
    const statusCode = health.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    console.error("[SearchController] Error checking health:", error);
    res.status(500).json({
      status: "error",
      details: { error: error.message },
    });
  }
});

/**
 * POST /api/search/cache/clear
 * Clear search cache
 */
router.post("/cache/clear", (req: Request, res: Response) => {
  try {
    semanticSearchService.clearCache();
    res.json({ message: "Cache cleared successfully" });
  } catch (error: any) {
    console.error("[SearchController] Error clearing cache:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

export default router;
