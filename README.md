# CMBM Bartender Gateway

**AI-powered cocktail assistant with intelligent CPU/GPU routing for the Cocktail Mixer Bartender Manager system.**

## Overview

The Bartender Gateway is the core AI service that powers the Mixologist conversational assistant. It provides:

- **Tiered LLM Routing**: Intelligent routing to CPU or GPU Ollama instances based on family subscription tier
- **Chat API**: RESTful HTTP API for conversational cocktail assistance
- **MCP Integration**: Connects to Model Context Protocol server for conversation history and context
- **Cost Optimization**: Routes free tier to cheap CPU hosting, premium tier to fast GPU hosting

## Architecture

### Service Boundaries

**What This Service Does:**
- ✅ HTTP API for chat requests
- ✅ Tiered routing (CPU vs GPU Ollama instances)
- ✅ Subscription tier checking
- ✅ Response generation and streaming
- ✅ Cost tracking and analytics

**What This Service Does NOT Do:**
- ❌ Conversation history storage (handled by MCP server)
- ❌ User authentication (handled by main API)
- ❌ Family management (handled by main API)
- ❌ Recipe data (handled by main API)

### Technology Stack

- **Runtime**: Node.js + TypeScript (ES2022 modules)
- **Framework**: Express.js
- **LLM Integration**: Ollama (local models)
- **AI Models**: Llama 3.2 8B fine-tuned (cocktail-bartender:latest)
- **Protocol**: HTTP/REST + WebSocket (future)
- **Deployment**: Docker container on internal network

## API Endpoints

### Chat API

```http
POST /api/chat/send
Content-Type: application/json
Authorization: Bearer {token}

{
  "familyId": "string",
  "userId": "string",
  "message": "string",
  "sessionId": "string?",
  "measurementSystem": "imperial" | "metric" | "both"
}

Response:
{
  "success": true,
  "message": "AI response text",
  "sessionId": "session_123",
  "metadata": {
    "tier": "free" | "premium",
    "instanceType": "cpu" | "gpu",
    "estimatedCost": 0.00001
  }
}
```

### Health Check

```http
GET /health

Response:
{
  "status": "healthy",
  "services": {
    "ollama": { "healthy": true, "model": "cocktail-bartender:latest" },
    "mcp": { "healthy": true }
  }
}
```

### LLM Information

```http
GET /api/llm/info

Response:
{
  "displayName": "Mixologist",
  "version": "November 2025",
  "status": "available",
  "capabilities": ["chat", "cocktail-recommendations", "recipe-analysis", "party-planning"],
  "analytics": {
    "provider": "ollama",
    "modelName": "cocktail-bartender:latest",
    "lastHealthCheck": "2025-11-07T12:00:00Z"
  }
}
```

## Tiered Routing System

### How It Works

1. **Request arrives** with familyId
2. **Subscription check**: Call `/families/{id}/subscription` on main API
3. **Route selection**:
   - Free tier → CPU instance (90s timeout, $0.00001/request)
   - Premium tier + GPU available → GPU instance (30s timeout, $0.0001/request)
   - GPU failure → Fallback to CPU
4. **Response generated** with metadata about routing and cost

### Instance Configuration

**CPU Instance (Always Available)**
```env
OLLAMA_CPU_BASE_URL=http://ollama-cpu:11434
OLLAMA_MODEL=cocktail-bartender:latest
```

**GPU Instance (On-Demand)**
```env
OLLAMA_GPU_BASE_URL=http://ollama-gpu:11434  # Optional
OLLAMA_MODEL=cocktail-bartender:latest
```

## Environment Variables

```bash
# Service Configuration
NODE_ENV=development|production
PORT=8000

# Main App Integration
MAIN_APP_URL=http://cmbm-main:3000

# Ollama Instances
OLLAMA_CPU_BASE_URL=http://ollama-cpu:11434
OLLAMA_GPU_BASE_URL=http://ollama-gpu:11434  # Optional
OLLAMA_MODEL=cocktail-bartender:latest

# MCP Server Integration
MCP_SERVER_URL=http://cmbm-mcp-server:8001
```

## Development

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Access to Ollama instance (CPU or GPU)

### Local Development

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start

# Run tests
npm test

# Type checking
npm run type-check
```

### Docker Development

```bash
# Build image
docker build -t cmbm-bartender-gateway:dev .

# Run container
docker run -p 8000:8000 \
  -e OLLAMA_CPU_BASE_URL=http://host.docker.internal:11434 \
  -e MAIN_APP_URL=http://cmbm-main:3000 \
  cmbm-bartender-gateway:dev
```

## Deployment

### Docker Compose (Development)

```yaml
services:
  cmbm-bartender-gateway:
    build: ../cmbm-bartender-gateway
    image: cmbm-bartender-gateway:latest
    ports:
      - "8000:8000"
    environment:
      NODE_ENV: development
      MAIN_APP_URL: http://cmbm-main:3000
      OLLAMA_CPU_BASE_URL: http://ollama-cpu:11434
    networks:
      - cmbm_internal
      - cmbm_public
```

### Production Deployment

**Network Architecture:**
- **Internal Network**: Service-to-service communication (HTTP, gRPC future)
- **Public Network**: User-facing traffic through nginx (HTTPS)

**Scaling Considerations:**
- **CPU Instance**: Single instance sufficient for free tier users
- **GPU Instance**: Provision when first premium subscription created
- **Horizontal Scaling**: Add more bartender-gateway instances behind load balancer

### Kubernetes/K3s Readiness

This service is designed for container orchestration:

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cmbm-bartender-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cmbm-bartender-gateway
  template:
    metadata:
      labels:
        app: cmbm-bartender-gateway
    spec:
      containers:
      - name: gateway
        image: cmbm-bartender-gateway:latest
        ports:
        - containerPort: 8000
        env:
        - name: MAIN_APP_URL
          value: "http://cmbm-main-service:3000"
```

## Monitoring & Observability

### Health Checks

```bash
# Docker health check
curl http://localhost:8000/health

# Kubernetes liveness probe
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Metrics

- Request count by tier (free/premium)
- Response time by instance (CPU/GPU)
- Cost per request
- Ollama health status
- MCP connection status

### Logging

```typescript
// Structured logging format
{
  "timestamp": "2025-11-07T12:00:00Z",
  "level": "info",
  "service": "bartender-gateway",
  "familyId": "family_123",
  "tier": "premium",
  "instanceType": "gpu",
  "duration": 2341,
  "cost": 0.0001
}
```

## Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
# Start dependencies
docker compose up -d ollama-cpu cmbm-main

# Run integration tests
npm run test:integration
```

### Load Testing

```bash
# Test CPU tier throughput
ab -n 1000 -c 10 -p request.json -T application/json http://localhost:8000/api/chat/send

# Test GPU tier latency
wrk -t4 -c100 -d30s http://localhost:8000/api/chat/send
```

## Security

### Network Isolation

- **Public Endpoint**: `/api/chat/send` (authenticated via JWT)
- **Internal Endpoint**: `/api/llm/info` (public for health checks)
- **Subscription Check**: Internal network only (no external access)

### Authentication

- JWT tokens validated by main API
- Bartender-gateway trusts tokens, does not validate
- Future: Service-to-service API keys

### Data Protection

- No PII stored in this service
- Conversation history stored in MCP server only
- Request/response logged without sensitive data

## Contributing

See main CMBM documentation for contribution guidelines:
- [Development Workflow](https://github.com/brecko/cmbm-docs/blob/main/DEVELOPMENT_WORKFLOW.md)
- [Issue Tracking](https://github.com/brecko/cmbm-docs/issues)

## License

Proprietary - See [LICENSE](LICENSE) file for details.

## Related Repositories

- **[cmbm-main](https://github.com/brecko/cmbm-main)**: Core NestJS API
- **[cmbm-mcp-server](https://github.com/brecko/cmbm-mcp-server)**: Conversation context management
- **[cmbm-frontend](https://github.com/brecko/cmbm-frontend)**: SvelteKit UI
- **[cmbm-deployment](https://github.com/brecko/cmbm-deployment)**: Docker orchestration
- **[cmbm-docs](https://github.com/brecko/cmbm-docs)**: Architecture documentation

---

**Status**: Production-ready, actively maintained  
**Version**: 1.0.0  
**Last Updated**: November 2025
