# AIGateway Agent

AI 驱动的 Higress AI 网关管理助手，基于 MCP (Model Context Protocol) 架构。

## 项目结构

pnpm monorepo，包含以下模块：

```
aigateway-agent/
├── apps/
│   ├── web/                    # 前端 (React + Vite, port 5173)
│   ├── bff/                    # Backend-For-Frontend (Express, port 3000)
│   ├── agent/                  # Agent 引擎 (Express + SSE, port 4000)
│   └── mcp-server-higress/     # MCP Server (Express + SSE, port 5000)
├── packages/
│   ├── shared/                 # 共享类型和常量
│   ├── mcp-client/             # MCP 客户端 (StandardMCPClient / MockMCPClient)
│   └── ui-components/          # 共享 UI 组件
└── deploy/docker/              # Docker 部署配置
```

### 数据流

```
用户 → Web → BFF → Agent (LLM意图解析 + 工具调度)
                      ↓
              StandardMCPClient (MCP/SSE协议)
                      ↓
              MCP Server Higress → Higress REST API
```

## 常用命令

```bash
# 本地开发
pnpm install
pnpm dev:all          # 启动所有服务

# 测试
pnpm test             # 运行全部测试 (vitest)
npx vitest run        # 单次运行

# Docker 本地
pnpm docker:up        # docker-compose.yml (开发)
pnpm docker:down
```

## 线上环境

### 服务器信息

| 项目 | 值 |
|------|-----|
| 公网 IP | 14.116.240.84 |
| SSH | `ssh root@14.116.240.84 -p 51060` (已配密钥免密) |
| 项目路径 | `/data/project/aigateway-agent/` |
| OS | CentOS 7, Docker 26.1.4, Docker Compose v2.27.1 |

### 端口映射

| 外网端口 | 内部端口 | 用途 |
|---------|---------|------|
| 51060 | 22 | SSH |
| 51061 | 80 | Web 前端 (用户访问入口) |

### 线上访问

- Web 前端: http://14.116.240.84:51061
- Higress Console: 容器内部 `higress:8001`（不对外暴露）

### 线上部署

使用 `docker-compose.prod.yml`，6 个容器：

| 容器 | 镜像 | 内部端口 | 说明 |
|------|------|---------|------|
| higress | higress/all-in-one:latest | 8001, 8080 | AI 网关 |
| redis | redis:7-alpine | 6379 | 会话存储 |
| mcp-server-higress | 本地构建 | 5000 | MCP Server (10个工具) |
| agent | 本地构建 | 4000 | Agent 引擎 (LLM + MCP) |
| bff | 本地构建 | 3000 | BFF 代理层 |
| web | 本地构建 | 5173→80 | 前端 |

启动顺序: Higress + Redis → MCP Server → Agent → BFF → Web

### 部署命令

```bash
# 1. 本地打包代码
cd /Users/gaozhenfeng/Documents/project/AIGateway-Agent/aigateway-agent
tar czf /tmp/aigateway-agent-deploy.tar.gz --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='.env' .

# 2. 上传到服务器
scp -P 51060 /tmp/aigateway-agent-deploy.tar.gz root@14.116.240.84:/tmp/

# 3. 服务器上解压 (保留 .env)
ssh root@14.116.240.84 -p 51060
cd /data/project/aigateway-agent
tar xzf /tmp/aigateway-agent-deploy.tar.gz

# 4. 重建并启动 (注意 --env-file 指向项目根目录的 .env)
cd deploy/docker
docker compose -f docker-compose.prod.yml --env-file ../../.env up --build -d

# 5. 查看日志
docker logs docker-agent-1 --tail 30
docker logs docker-mcp-server-higress-1 --tail 30
```

### 线上 .env 配置 (`/data/project/aigateway-agent/.env`)

```
LLM_PROVIDER=qwen
LLM_API_KEY=sk-***
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
MCP_SERVER_URL=http://mcp-server-higress:5000   # Docker 内部用服务名
HIGRESS_CONSOLE_URL=http://higress:8001          # Docker 内部用服务名
HIGRESS_CONSOLE_USERNAME=admin
HIGRESS_CONSOLE_PASSWORD=admin
REDIS_URL=redis://redis:6379                     # Docker 内部用服务名
MOCK_MODE=false
```

> 注意: docker-compose.prod.yml 中 `environment:` 会覆盖 `.env` 中的 Docker 网络地址 (如 `MCP_SERVER_URL`, `REDIS_URL`)。`.env` 中的 `localhost` 地址仅用于本地开发。启动时必须加 `--env-file ../../.env` 以确保 LLM 配置正确传入。

### 健康检查

```bash
# Agent 健康状态 (在服务器上)
docker exec docker-agent-1 wget -qO- http://localhost:4000/agent/health

# MCP 工具列表
docker exec docker-agent-1 wget -qO- http://localhost:4000/agent/mcp-status

# 测试消息
docker exec docker-agent-1 wget -qO- \
  --post-data='{"sessionId":"test","message":"查看当前所有 AI 提供商"}' \
  --header="Content-Type: application/json" \
  http://localhost:4000/agent/message
```

## 架构要点

- **IMCPClient 接口**: `packages/mcp-client/src/types.ts` 定义了可替换的 MCP 客户端接口，支持 `StandardMCPClient` (SSE连接真实MCP Server) 和 `MockMCPClient` (内存模拟)
- **LLM 意图解析**: `apps/agent/src/engine/orchestrator.ts` 中 `parseLLMIntent()` 调用 LLM 将自然语言转为结构化意图 (read/write/chat/clarification)，失败时回退到正则匹配
- **MCP Server**: `apps/mcp-server-higress/` 通过 `@modelcontextprotocol/sdk` 暴露 10 个工具 (5 provider + 5 route)，可替换为其他网关的 MCP Server
- **安全确认**: 写操作 (add/update/delete) 需用户确认后才执行，支持回滚
