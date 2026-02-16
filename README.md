# AIGateway-Agent

通过对话式 AI 管理 [Higress](https://higress.io/) AI Gateway 的配置，支持 AI 提供商管理、智能路由、流量调度、风险管控和一键回滚。

## 需求概述

### 核心问题

Higress AI Gateway 的配置管理涉及多个概念（提供商、路由、权重、容灾、模型映射），传统表单式 Console 操作门槛高、易出错。本项目通过自然语言对话降低配置复杂度：

- **用户说** "配置 OpenAI 接入，Key 是 sk-xxx" → Agent 自动生成配置、展示确认卡片、一键提交
- **用户说** "把流量全切到 DeepSeek" → Agent 检测到高风险操作，显示 diff 对比和警告
- **用户说** "回滚上一步" → Agent 撤销最近操作，恢复到之前状态

### 功能需求

| 功能模块 | 描述 |
|---------|------|
| **AI 提供商管理** | 增删改查 26 种 LLM 提供商（OpenAI、DeepSeek、Qwen、Claude 等），API Key 脱敏展示 |
| **AI 路由管理** | 创建/更新/删除路由，支持多模型负载均衡（权重分配）、模型名称映射、容灾回退 |
| **安全检查** | 5 条静态规则引擎：全量流量切换检测、生产路由删除拦截、权重校验、批量操作警告 |
| **风险分级确认** | 低风险(创建)→摘要卡片、中风险(更新)→Diff对比卡片、高风险(删除)→名称确认卡片 |
| **版本化回滚** | 所有写操作记录变更日志，支持回滚上一步、回滚到指定版本，多步连续回滚 |
| **对话记忆** | 上下文感知，支持指代消解（"那个路由"→最近引用的路由），100条消息窗口 |
| **实时仪表盘** | 通过 WebSocket/SSE 推送配置变更事件，前端实时刷新提供商和路由状态 |
| **指标监控** | 请求计数、延迟统计（Avg/P95）、工具调用计数、服务运行时间 |

## 架构设计

### 整体架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Web UI     │────▶│     BFF      │────▶│   Agent Engine   │────▶│   Higress   │
│  (React)     │ WS  │  (Express)   │ SSE │  (Orchestrator)  │ HTTP│  AI Gateway │
│  :5173       │     │  :3000       │     │  :4000           │     │  :8080      │
└──────────────┘     └──────────────┘     └──────────────────┘     └─────────────┘
        │                                          │
        │  Vite Proxy                              ▼
        │  (/login,/css,/js,/session,/v1)  ┌─────────────────┐
        └─────────────────────────────────▶│     Redis       │
           Higress Console 反向代理         │  (会话/变更日志) │
                                           │  :6379          │
                                           └─────────────────┘
```

Web 层通过 Vite 反向代理同时承载前端应用和 Higress Console，用户在同一端口即可访问两个界面。

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| BFF | Express 5 + WebSocket (ws) |
| Agent 引擎 | Express 4 + 规则引擎 + Vercel AI SDK |
| MCP 客户端 | 自研 HigressMCPClient（HTTP Session 认证 / Mock 双模式） |
| 存储 | Redis（变更日志 + 会话）/ 内存 Fallback |
| 构建 | pnpm Workspace + Turborepo |
| 测试 | Vitest |
| 部署 | Docker Compose（开发 + 生产） |

### Monorepo 结构

```
aigateway-agent/
├── apps/
│   ├── agent/                  # Agent 引擎 — 核心编排
│   │   └── src/
│   │       ├── index.ts        # Express 服务 + API 端点
│   │       ├── engine/
│   │       │   └── orchestrator.ts   # 意图解析 + 工具编排
│   │       ├── llm/
│   │       │   └── llmService.ts     # LLM API 管理（多 Provider）
│   │       ├── safety/
│   │       │   ├── preprocessor.ts   # 静态规则引擎 (R001-R007)
│   │       │   └── riskAssessor.ts   # 风险评估 + 确认卡片
│   │       ├── rollback/
│   │       │   ├── changelogManager.ts  # 变更日志管理
│   │       │   └── rollbackExecutor.ts  # 回滚执行器
│   │       ├── conversation/
│   │       │   └── memory.ts         # 对话记忆 + 指代消解
│   │       ├── metrics/
│   │       │   └── collector.ts      # 指标采集
│   │       └── prompts/
│   │           ├── system.ts         # 系统提示词
│   │           └── intentParsing.ts  # 意图解析提示词
│   ├── bff/                    # Backend For Frontend
│   │   └── src/
│   │       ├── index.ts        # Express + WebSocket 服务
│   │       ├── routes/
│   │       │   ├── session.ts  # 会话管理路由
│   │       │   └── dashboard.ts # 仪表盘路由
│   │       └── ws/
│   │           └── chatGateway.ts  # WebSocket 网关
│   └── web/                    # React 前端
│       └── src/
│           ├── components/     # ChatPanel, Dashboard, ConfirmCards, LLMConfigDialog...
│           ├── stores/         # Zustand 状态管理 (chat, dashboard, theme, debug)
│           └── hooks/          # 自定义 Hooks
├── packages/
│   ├── shared/                 # 共享类型、常量、工具函数
│   ├── mcp-client/             # Higress MCP 客户端（Session 认证 + Mock）
│   └── ui-components/          # 可复用 UI 组件
└── deploy/
    ├── docker/                 # Docker Compose + Dockerfile
    │   ├── docker-compose.yml         # 开发环境
    │   ├── docker-compose.prod.yml    # 生产环境
    │   ├── docker-compose.infra.yml   # 仅基础设施
    │   ├── Dockerfile.web
    │   ├── Dockerfile.bff
    │   └── Dockerfile.agent
    └── scripts/                # 部署脚本
        ├── server-setup.sh     # 服务器初始化
        ├── deploy.sh           # 部署执行
        ├── verify.sh           # 健康验证
        └── e2e-test.sh         # 端到端测试
```

### Agent 引擎处理流程

```
用户消息
  │
  ▼
┌─────────────────┐
│  意图解析        │  正则匹配 + LLM 解析（可选）
│  (parseIntent)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
  读操作    写操作
    │         │
    ▼         ▼
  直接执行  ┌──────────────┐
  返回结果  │ 预处理器检查   │  R001-R007 规则
            │ (Preprocessor)│
            └──────┬───────┘
                   │
              允许? │
         ┌────┴────┐
         No        Yes
         │          │
      拦截返回    ┌──────────────┐
                 │ 风险评估      │
                 │ (RiskAssessor)│
                 └──────┬───────┘
                        │
                  ┌─────┴─────┐
                  │ 确认卡片   │  summary / diff / name_input
                  └─────┬─────┘
                        │
                    用户确认
                        │
                  ┌─────┴─────┐
                  │ 执行工具   │ → MCP Client → Higress API
                  │ 记录变更   │ → ChangelogManager
                  └───────────┘
```

### 安全规则引擎

| 规则 | 描述 | 级别 |
|------|------|------|
| R001 | 全量流量切换（weight=100/0） | 风险提升至 high |
| R002 | 删除名称含 prod/production/main 的路由 | 风险提升至 high |
| R003 | API Key 变更 | 附加警告 |
| R005 | 路由权重总和 ≠ 100 | **拦截** |
| R007 | 3 个以上写操作（批量） | 附加警告 |

### MCP 客户端

10 个工具覆盖提供商和路由的完整 CRUD：

| 工具 | 类型 | 说明 |
|------|------|------|
| `list-ai-providers` | 读 | 列出所有提供商 |
| `get-ai-provider` | 读 | 获取提供商详情 |
| `add-ai-provider` | 写 | 添加提供商 |
| `update-ai-provider` | 写 | 更新提供商 |
| `delete-ai-provider` | 写 | 删除提供商 |
| `list-ai-routes` | 读 | 列出所有路由 |
| `get-ai-route` | 读 | 获取路由详情 |
| `add-ai-route` | 写 | 创建路由 |
| `update-ai-route` | 写 | 更新路由 |
| `delete-ai-route` | 写 | 删除路由 |

MCP 客户端通过 Higress Console 的 Session 认证（`POST /session/login`）获取会话 Cookie，并在 401 时自动重新登录重试。Mock 模式下数据存储在内存中，无需 Higress 实例。

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 10

### 本地开发（Mock 模式）

```bash
# 安装依赖
pnpm install

# 同时启动所有服务
pnpm dev:all

# 或分别启动
pnpm dev:agent   # Agent 引擎 → http://localhost:4000
pnpm dev:bff     # BFF 服务   → http://localhost:3000
pnpm dev:web     # Web 前端   → http://localhost:5173
```

Mock 模式下无需 Higress 和 Redis，所有数据存储在内存中。

### Docker Compose 部署（开发）

```bash
# 启动全部服务（Higress + Redis + Agent + BFF + Web）
pnpm docker:up

# 查看日志
pnpm docker:logs

# 停止
pnpm docker:down
```

### Docker Compose 部署（生产）

```bash
# 使用生产配置启动
docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env up --build -d

# 查看日志
docker compose -f deploy/docker/docker-compose.prod.yml logs -f

# 停止
docker compose -f deploy/docker/docker-compose.prod.yml down
```

生产模式与开发模式的区别：

| 差异 | 开发模式 | 生产模式 |
|------|---------|---------|
| MOCK_MODE | true | false |
| Web 端口 | 5173 | 80 |
| 重启策略 | 无 | unless-stopped |
| Higress 健康检查 | 默认 | start_period: 30s, retries: 10 |
| BFF/Agent/Redis 端口 | 暴露到宿主机 | 仅容器内网 |
| Higress Console | 独立端口访问 | 通过 Web 反向代理（`/login`） |

### 服务地址

**开发模式：**

| 服务 | 地址 | 说明 |
|------|------|------|
| Web UI | http://localhost:5173 | 浏览器打开 |
| BFF API | http://localhost:3000 | REST + WebSocket |
| Agent Engine | http://localhost:4000 | SSE 流式响应 |
| Higress Console | http://localhost:8001 | AI Gateway 管理 |
| Redis | localhost:6379 | 会话存储 |

**生产模式：**

| 服务 | 地址 | 说明 |
|------|------|------|
| Web UI | http://\<server-ip\>:80 | 主入口 |
| Higress Console | http://\<server-ip\>:80/login | 通过 Web 反向代理 |
| BFF / Agent / Redis | 容器内网 | 不暴露外部端口 |

### 环境变量

复制 `.env` 文件并按需修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MOCK_MODE` | `true` | Mock 模式（无需 Higress） |
| `HIGRESS_CONSOLE_URL` | `http://localhost:8001` | Higress Console 内部地址 |
| `HIGRESS_CONSOLE_EXTERNAL_URL` | `/login` | Higress Console 前端访问地址 |
| `HIGRESS_CONSOLE_USERNAME` | `admin` | Higress Console 用户名 |
| `HIGRESS_CONSOLE_PASSWORD` | `admin` | Higress Console 密码 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接地址 |
| `LLM_PROVIDER` | - | LLM 提供商（openai/qwen/deepseek/claude 等） |
| `LLM_API_KEY` | - | LLM API Key |
| `LLM_BASE_URL` | - | LLM API 端点（可选，自动推断） |
| `LLM_MODEL` | - | LLM 模型名称（如 gpt-4o、qwen-plus） |
| `SESSION_SECRET` | - | BFF 会话密钥 |
| `FEATURE_ROLLBACK_ENABLED` | `true` | 启用回滚功能 |
| `FEATURE_DASHBOARD_ENABLED` | `true` | 启用仪表盘 |
| `FEATURE_PREDICTIVE_FORM_ENABLED` | `true` | 启用预测表单 |
| `FEATURE_PREPROCESSOR_ENABLED` | `true` | 启用安全预处理器 |
| `MAX_CONCURRENT_SESSIONS` | `50` | 最大并发会话数 |
| `MAX_CHANGELOG_DEPTH` | `50` | 变更日志最大深度 |
| `SESSION_TTL_SECONDS` | `7200` | 会话过期时间（秒） |

## 运行测试

```bash
# 运行全部测试（101 个测试用例）
pnpm test

# 查看测试覆盖的模块：
# - packages/shared:      utils + constants (18 tests)
# - packages/mcp-client:  client CRUD + tool definitions (28 tests)
# - apps/agent:           preprocessor, riskAssessor, changelog,
#                         rollback, memory, orchestrator, metrics (53 tests)
# - apps/bff:             route exports (2 tests)
```

## API 端点

### Agent Engine (`:4000`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/agent/health` | 健康检查 |
| GET | `/agent/llm-config` | 获取 LLM 配置 |
| POST | `/agent/llm-config` | 更新 LLM 配置 |
| POST | `/agent/message` | 处理用户消息（SSE 流） |
| POST | `/agent/confirm` | 确认/取消操作 |
| POST | `/agent/rollback` | 回滚上一步 |
| POST | `/agent/rollback-to-version` | 回滚到指定版本 |
| GET | `/agent/timeline` | 获取变更时间线 |
| GET | `/agent/tools` | 列出所有工具 |
| GET | `/agent/providers` | 直接查询提供商 |
| GET | `/agent/routes` | 直接查询路由 |
| GET | `/agent/metrics` | 运行指标 |

### BFF (`:3000`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/session/create` | 创建会话 |
| GET | `/api/session/health` | Agent 健康代理 |
| POST | `/api/session/message` | 代理消息（SSE） |
| POST | `/api/session/confirm` | 代理确认操作 |
| GET | `/api/session/llm-config` | 获取 LLM 配置 |
| POST | `/api/session/llm-config` | 更新 LLM 配置 |
| GET | `/api/dashboard/providers` | 查询提供商 |
| GET | `/api/dashboard/routes` | 查询路由 |
| GET | `/api/dashboard/metrics` | 查询指标 |
| WS | `/ws` | WebSocket 实时通信 |

### Vite 反向代理（生产模式）

Web 层通过 Vite 反向代理将 Higress Console 嵌入同一端口：

| 路径 | 代理目标 | 说明 |
|------|---------|------|
| `/api/*` | BFF | 业务 API |
| `/ws` | BFF | WebSocket |
| `/css/*`, `/js/*` | Higress | 控制台静态资源 |
| `/session/*` | Higress | 控制台认证 |
| `/v1/*` | Higress | 控制台 API |
| `/system/*` | Higress | 控制台系统接口 |
| `/login`, `/init` 等 HTML 页面 | Higress | 控制台 SPA 路由（通过 Vite 插件） |

## 使用示例

在聊天框中输入自然语言即可操作：

```
# 查询
"列出所有 AI 提供商"
"查看网关整体配置"

# 创建提供商
"配置 OpenAI 接入，Key 是 sk-xxx"
"添加 DeepSeek 提供商，Key 是 sk-xxx"

# 创建路由
"创建 AI 路由，70% OpenAI 30% DeepSeek"

# 流量调度
"把流量全切到 DeepSeek"

# 删除
"删除 openai 提供商"

# 回滚
"回滚上一步"
"撤销"
```

## 部署到云服务器

### 前置条件

- 云服务器（CentOS 7 / Ubuntu 等）
- Docker CE + Docker Compose v2
- 开放外网端口（如 80 或自定义端口）

### 步骤

1. **服务器环境准备**：安装 Docker，配置镜像加速

   ```bash
   # 使用提供的初始化脚本
   bash deploy/scripts/server-setup.sh
   ```

2. **传输代码**

   ```bash
   rsync -avz --exclude={node_modules,.turbo,dist,.git} \
     -e "ssh -p <ssh-port>" \
     ./ root@<server-ip>:/data/project/aigateway-agent/
   ```

3. **配置环境变量**：将 `.env` 复制到服务器并修改 LLM 相关配置

4. **构建并启动**

   ```bash
   docker compose -f deploy/docker/docker-compose.prod.yml --env-file .env up --build -d
   ```

5. **验证**

   ```bash
   bash deploy/scripts/verify.sh
   ```

### Docker 镜像源说明

Dockerfile 中使用的基础镜像已配置为国内可用的镜像源：

- Node.js: `docker.m.daocloud.io/library/node:20-alpine`
- Redis: `docker.m.daocloud.io/library/redis:7-alpine`
- npm 包: `.npmrc` 配置 `registry.npmmirror.com`

如在海外环境部署，可将镜像源替换回官方源。

## License

MIT
