import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ChatController } from './controllers/chat.controller.js';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 8000;

// Initialize controllers
const chatController = new ChatController();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bartender-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Ollama health check (proxied from OllamaClient)
app.get('/api/ollama/health', chatController.healthCheck.bind(chatController));

// LLM info endpoint (for main app system controller)
app.get('/api/llm/info', chatController.getLLMInfo.bind(chatController));

// Chat endpoints
app.post('/api/chat/message', chatController.sendMessage.bind(chatController));
app.get('/api/chat/sessions', chatController.getSessions.bind(chatController));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍸 Bartender Gateway running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Ollama URL: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
  console.log(`🎯 Model: ${process.env.OLLAMA_MODEL || 'cocktail-bartender:latest'}`);
});

export default app;
