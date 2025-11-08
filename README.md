# Bartender Gateway (Mixologist AI Service)

Express.js API gateway that connects the CMBM frontend to the local Ollama LLM with MCP context enrichment for intelligent cocktail assistance.

## Architecture

```
Frontend (SvelteKit)
  ↓ HTTP POST /api/ai-user/chat/message
nginx reverse proxy
  ↓ proxy to ai-infrastructure:8000
Bartender Gateway (Express.js) ← THIS SERVICE
  ↓ Context enrichment via MCP Server
MCP Server (port 3100)
  ├─ MongoDB (conversation history, preferences)
  ├─ Tools (check_inventory, find_recipes, etc.)
  └─ Resources (inventory://, recipes://, preferences://)
  ↓
Bartender Gateway generates enriched prompt
  ↓ HTTP POST /api/generate
Ollama (port 11434)
  ↓ Uses model
cocktail-bartender:latest (Mistral 7B fine-tuned)
```

## Features

- **MCP Integration**: Context-aware responses using Model Context Protocol
  - Conversation history retrieval and storage
  - User preferences integration
  - Family inventory access
  - Recipe lookup and recommendations
- **Chat Interface**: RESTful API for conversational AI interactions
- **Health Monitoring**: Ollama and MCP server connectivity checks
- **LLM Info**: Provides model information to main app system controller
- **Context Enrichment**: Automatic context building from conversation history, preferences, and inventory
- **Smart Query Detection**: Automatically detects inventory and recipe queries for tool calls
- **Error Handling**: Comprehensive error handling for LLM timeouts, connection issues
- **CORS Support**: Configurable cross-origin resource sharing
- **Docker Ready**: Multi-stage Dockerfile with health checks

## API Endpoints

### Chat
- `POST /api/chat/message` - Send chat message to Mixologist AI with MCP context enrichment
- `GET /api/chat/sessions` - Get chat sessions for a family (TODO: database integration)

### Monitoring
- `GET /health` - Service health check (includes Ollama and MCP status)
- `GET /api/ollama/health` - Ollama connectivity and model check
- `GET /api/llm/info` - LLM model information (for system controller)

## Environment Variables

```bash
# Server
NODE_ENV=development|production
PORT=8000

# Ollama
OLLAMA_BASE_URL=http://localhost:11434  # or http://ollama:11434 in Docker
OLLAMA_MODEL=cocktail-bartender:latest
OLLAMA_TIMEOUT=30000

# MCP Server
MCP_SERVER_URL=http://localhost:3100  # or http://mcp-server:3100 in Docker

# CORS
CORS_ORIGIN=*  # or specific origins
```

## Development

```bash
# Install dependencies
npm install

# Start development server (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Testing Locally

### Prerequisites
1. Ollama installed and running: `ollama serve`
2. Model loaded: `ollama pull cocktail-bartender:latest`
3. MCP Server running on port 3100
4. MongoDB running for MCP storage

### Quick Integration Test
```bash
# Run comprehensive integration test
./test-integration.sh
```

### Manual Testing
```bash
# Start development server
npm run dev

# In another terminal, test health check
curl http://localhost:8000/health

# Test Ollama health
curl http://localhost:8000/api/ollama/health

# Test chat message (with MCP context enrichment)
curl -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "familyId": "test-family-id",
    "userId": "test-user-id",
    "message": "What cocktails can I make with vodka?"
  }'

# Test with session continuity
curl -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "familyId": "test-family-id",
    "userId": "test-user-id",
    "sessionId": "session-123",
    "message": "I love margaritas"
  }'

curl -X POST http://localhost:8000/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "familyId": "test-family-id",
    "userId": "test-user-id",
    "sessionId": "session-123",
    "message": "Suggest a variation"
  }'
```

## Docker Deployment

```bash
# Build image
docker build -t cmbm/bartender-gateway:latest .

# Run container
docker run -d \
  --name bartender-gateway \
  -p 8000:8000 \
  -e OLLAMA_BASE_URL=http://ollama:11434 \
  -e OLLAMA_MODEL=cocktail-bartender:latest \
  --network cmbm-network \
  cmbm/bartender-gateway:latest
```

## Integration with CMBM Ecosystem

### Main App Integration
The main app's `ai.service.ts` proxies AI requests to this service at `http://ai-infrastructure:8000`.

### Frontend Integration
The frontend's Mixologist chat component sends messages to:
```
${API_BASE_URL}/ai-user/chat/message
```

nginx proxies this to bartender-gateway at `/api/chat/message`.

### Ollama Integration
Bartender Gateway connects to Ollama at `OLLAMA_BASE_URL` (default: `http://ollama:11434`).

## File Structure

```
bartender-gateway/
├── src/
│   ├── controllers/
│   │   └── chat.controller.ts       # Express route handlers with MCP integration
│   ├── services/
│   │   ├── ollama-client.ts         # Ollama API client
│   │   └── mcp-client.ts            # MCP Server client (NEW)
│   └── server.ts                    # Express app
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── Dockerfile                       # Multi-stage Docker build
├── .dockerignore                    # Docker build optimization
├── .env.development                 # Local development config
├── .env.production                  # Production config
├── .env.example                     # Example environment variables
└── test-integration.sh              # Integration test script (NEW)
```

## MCP Integration Details

### MCP Client Features

The `MCPClient` service provides:

1. **Tool Calls**:
   - `check_inventory(familyId, ingredient)` - Check ingredient availability
   - `find_recipes(familyId, ingredients, category)` - Find matching recipes
   - `store_preference(familyId, userId, type, value)` - Store user preferences

2. **Resource Access**:
   - `inventory://family/{familyId}/ingredients` - Family inventory
   - `preferences://user/{userId}@{familyId}` - User preferences
   - `conversations://session/{sessionId}@{familyId}` - Conversation history

3. **Context Building**:
   - Automatic retrieval of conversation history (last 5 messages)
   - User preference integration (favorite drinks, dietary restrictions)
   - Family inventory context (available ingredients)

### Query Detection

The chat controller automatically detects:

- **Inventory Queries**: "Do I have vodka?", "Is there any rum in stock?"
- **Recipe Queries**: "What cocktails can I make?", "Suggest a drink with gin"

When detected, it calls appropriate MCP tools for context enrichment before sending to Ollama.

### Response Flow

```
1. User sends message
2. Store user message in MCP (conversation history)
3. Build enriched context:
   - Retrieve conversation history from MCP
   - Get user preferences from MCP
   - Get family inventory from MCP
   - Call MCP tools if query detected (inventory check, recipe lookup)
4. Send enriched prompt to Ollama
5. Store assistant response in MCP
6. Return response to user
```

## TypeScript Configuration

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict Mode**: Enabled
- **Output**: `./dist` directory

## TODO

- [x] Database integration for conversation history (via MCP Server)
- [x] Fetch inventory context from main app for better recommendations (via MCP)
- [x] Session management and persistence (via MCP)
- [ ] Rate limiting for API endpoints
- [ ] Request/response caching
- [ ] Metrics collection (Prometheus)
- [ ] Integration tests with Jest
- [ ] Load testing with k6

## Dependencies

### Production
- `express` - Web framework
- `axios` - HTTP client for Ollama and MCP API
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment configuration

### Development
- `typescript` - Type safety
- `tsx` - TypeScript execution
- `nodemon` - Development hot reload
- `@types/*` - TypeScript type definitions
- `eslint` - Code linting

## License

MIT
