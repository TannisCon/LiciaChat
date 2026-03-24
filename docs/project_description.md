# LiciaChat - 项目技术文档

## 项目概述

LiciaChat 是一个轻量化的、前后端可分离部署的全栈 LLM Chat 应用，由 React + TypeScript 前端和 FastAPI 后端组成。应用提供用户认证、对话历史持久化、滚动摘要等功能，通过阿里云百炼平台 API（或其他兼容 OpenAI 格式的 LLM API）实现 AI 对话能力。

### 核心特性

1. **用户认证系统**：基于 JWT 的用户登录、token 验证和刷新，支持用户名和密码修改
2. **对话管理**：创建、删除、列表查询对话，支持自定义标题
3. **对话持久化**：自动保存对话历史到 SQLite 数据库
4. **对话标题生成**：在第一轮对话完成后异步生成简洁标题
5. **对话历史滚动摘要**：当对话超过阈值时自动进行结构化摘要，保持上下文窗口高效利用
6. **推理模式支持**：支持启用/禁用 AI 推理内容输出
7. **流式响应**：实时显示 AI 回复，支持推理内容折叠展示，Token 消耗展示
8. **Markdown 渲染**：支持代码高亮、数学公式、表格等
9. **BYOK 模式**：用户自带 API Key（Bring Your Own Key）
10. **邀请码系统**：支持管理员和授信用户创建邀请码
11. **动态配置**：支持热重载的模型配置和 Prompt 配置

---

## 技术栈

### 后端

| 技术 | 用途 |
|------|------|
| Python 3.11+ | 主要编程语言 |
| FastAPI | Web 框架 |
| Uvicorn | ASGI 服务器 |
| SQLite | 数据库 |
| SQLModel | ORM 框架 |
| PyJWT | JWT 认证 |
| bcrypt | 密码哈希 |
| OpenAI SDK | 调用 LLM API |
| SlowAPI | 速率限制中间件 |
| cryptography | API Key 加密存储（AES-256-GCM） |

### 前端

| 技术 | 用途 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS | 样式框架 |
| Zustand | 状态管理 |
| React Markdown | Markdown 渲染 |
| Rehype/Remark/Prism | 数学公式、代码高亮插件 |
| Axios | HTTP 客户端 |

---

## 项目结构

```
LiciaChat/
├── main.py                    # FastAPI 主入口，API 路由定义
├── appinit.py                 # 配置单例和数据库初始化
├── auth.py                    # 用户认证和帐户管理
├── account.py                 # BYOK 用户注册和邀请码管理
├── chat.py                    # Chat Completions API 处理
├── history.py                 # 对话历史持久化和摘要
├── config.yaml.example        # 配置文件模板
├── requirements.txt           # Python 依赖
├── .env.example               # 环境变量模板
├── .gitignore                 # Git 忽略文件
├── frontend/                  # 前端项目目录
│   ├── src/
│   │   ├── App.tsx            # 应用入口
│   │   ├── pages/
│   │   │   └── ChatPage.tsx   # 聊天页面
│   │   ├── components/
│   │   │   ├── Layout.tsx     # 布局组件
│   │   │   ├── LoginModal.tsx # 登录弹窗
│   │   │   ├── UserProfileModal.tsx  # 用户信息弹窗
│   │   │   ├── CodeBlock.tsx  # 代码块组件
│   │   │   ├── markdown-components.tsx  # Markdown 自定义组件
│   │   │   ├── EditTitleModal.tsx  # 编辑标题弹窗
│   │   │   ├── DeleteConfirmModal.tsx  # 删除确认弹窗
│   │   │   └── ...
│   │   ├── store/
│   │   │   ├── authStore.ts   # 认证状态管理
│   │   │   └── chatStore.ts   # 聊天状态管理
│   │   ├── hooks/
│   │   │   └── useAuth.ts     # 认证 Hook
│   │   ├── services/
│   │   │   ├── authApi.ts     # 认证 API 服务
│   │   │   └── chatApi.ts     # 聊天 API 服务
│   │   └── lib/
│   │       └── prism-config.ts  # Prism 代码高亮配置
│   ├── package.json
│   └── vite.config.ts
├── static/                    # 静态文件目录
│   └── uploads/
│       ├── avatars/           # 用户头像
│       └── files/             # 用户上传文件
├── utils/                     # 工具模块
│   ├── apikeytool.py          # API Key 加密/解密
│   ├── crypto.py              # 加密工具
│   ├── load_models.py         # 动态模型配置加载
│   ├── load_prompts.py        # 动态 Prompt 加载
│   ├── usage.py               # 使用统计工具
│   └── uuid_utils.py          # UUID 工具
├── dynamic_config/            # 动态配置目录（支持热重载）
│   ├── models.json            # 模型配置
│   └── prompts.yaml           # Prompt 模板
└── docs/                      # 文档目录
    ├── project_description.md
    ├── prod_deploy.md
    └── database_structure.md
```

---

## 后端 API 端点

### 认证相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 用户登录 | 否 |
| POST | `/api/auth/register` | 用户注册（BYOK） | 否 |
| POST | `/api/auth/refresh` | 刷新 token | Cookie |
| POST | `/api/auth/logout` | 用户登出 | 否 |
| GET | `/api/user/me` | 获取当前用户信息 | 是 |
| PATCH | `/api/user/me` | 更新用户名 | 是 |
| PATCH | `/api/user/password` | 更新密码 | 是 |

### 对话相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/chat` | 创建新对话 | 是 |
| GET | `/api/chat` | 获取对话列表 | 是 |
| GET | `/api/chat/{chat_id}` | 获取对话完整历史 | 是 |
| DELETE | `/api/chat/{chat_id}` | 删除对话 | 是 |
| PATCH | `/api/chat/{chat_id}` | 更新对话标题和使用的模型 | 是 |
| POST | `/api/chat/{chat_id}/completions` | 带持久化的对话补全 | 是 |
| POST | `/v1/chat/completions` | OpenAI 兼容的无状态对话 | 是 |
| GET | `/v1/models` | 获取可用模型列表 | 是 |

### 邀请码相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/user/invite` | 创建邀请码 | 是 (admin/trusted) |
| GET | `/api/user/invite` | 获取邀请码列表 | 是 (admin/trusted) |
| DELETE | `/api/user/invite/{code}` | 删除邀请码 | 是 (admin/trusted) |

### API Key 相关

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | `/api/user/apikey` | 获取 API Key 信息 | 是 |
| POST | `/api/user/apikey` | 更新/清除 API Key | 是 |

---

## 数据库模型

### User 表

| 字段 | 类型 | 描述 |
|------|------|------|
| uid | int | 主键，自增，从 10000 开始 |
| uuid | str | UUIDv4，唯一索引，关联其他表 |
| email | str | 用户邮箱，唯一索引，用于登录 |
| username | str | 用户名，≤16 字符，仅用于展示 |
| password_hash | str | bcrypt 哈希密码 |
| role | str | 用户角色（admin/user/trusted） |
| created_at | datetime | 账户创建时间 (UTC) |
| private | str | JSON 字符串，存储额外信息 |
| password_changed_at | datetime | 密码修改时间 (UTC) |

### Chat 表

| 字段 | 类型 | 描述 |
|------|------|------|
| chat_id | str | 主键，格式 "chat-{uuid7}" |
| uuid | str | 外键，关联 User.uuid |
| title | str | 对话标题 |
| current_model | str | 当前对话使用的模型 |
| created_at | int | 创建时间戳 (UTC) |
| updated_at | int | 更新时间戳 (UTC) |
| history_recent | str | JSON，最近对话历史 |
| history_full | str | JSON，完整对话历史 |
| history_compressed | str | JSON，压缩摘要历史 |
| total_rounds | int | 总对话轮数（待实现） |
| total_tokens | int | 总 token 消耗（待实现） |

### InviteCode 表

| 字段 | 类型 | 描述 |
|------|------|------|
| code | str | 主键，12 字符 Base32 编码 |
| user_id | str | 外键，关联 User.uuid（创建者） |
| type | str | 邀请码类型（user/trusted） |
| created_at | datetime | 创建时间 (UTC) |
| used_by | str | JSON，使用用户邮箱列表 |
| used_at | str | JSON，使用时间列表 |
| uses | int | 已使用次数 |
| max_uses | int | 最大使用次数（0 表示无限制） |
| expires_at | datetime | 过期时间 (UTC) |
| note | str | 备注（≤255 字符） |

### ApiKey 表

| 字段 | 类型 | 描述 |
|------|------|------|
| user_id | str | 主键，外键，关联 User.uuid |
| provider | str | Key 提供商（bailian/vllm） |
| base_url | str | API Base URL |
| encrypted_key | bytes | AES-256-GCM 加密后的密文 |
| iv | bytes | AES 的 IV |
| tag | bytes | AES-GCM 的 tag |
| updated_at | datetime | Key 创建/更改时间 (UTC) |
| status | str | 状态（pending/valid/quota/invalid） |

---

## 对话历史滚动摘要机制

### 工作流程

1. **正常追加**：每次对话追加到 `history_recent`
2. **触发摘要**：当 `history_recent` 超过 `max_recent_rounds` (默认 6 轮) 时，异步触发摘要处理
3. **队头处理**：
   - 提取队头对话（第 0 轮）
   - 如果当前轮数 < `force_dequeue_rounds` (默认 16 轮)：调用 lite_llm_api 进行结构化摘要
   - 如果当前轮数 ≥ `force_dequeue_rounds`：直接使用全量对话（强制出队）
4. **存储压缩历史**：将摘要结果追加到 `history_compressed`
5. **历史拼接**：发送给 LLM 的消息 = system prompt + history_compressed + history_recent + 当前消息

### 摘要配置（config.yaml）

| 配置项 | 默认值 | 描述 |
|--------|--------|------|
| max_recent_rounds | 6 | 开始摘要的阈值 |
| force_dequeue_rounds | 16 | 强制出队的阈值 |
| compress_timeout | 60 | 摘要请求超时时间（秒） |
| compress_max_retries | 2 | 最大重试次数 |

---

## 配置文件

### config.yaml

```yaml
# JWT 配置
admin_email: "admin@example.com"
jwt_secret: "your-secret-key-change-in-production"
jwt_algorithm: "HS256"
jwt_expire_minutes: 30
refresh_token_expire_days: 30

# BYOK 安全配置
registration_enabled: false
api_key_encryption_key: "your-api-key-encryption-key-here"

# LLM API 配置
dashscope_api_key: "sk-xxx"  # 也可使用环境变量 DASHSCOPE_API_KEY
dashscope_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
main_llm_model: "qwen3.5-plus"
lite_llm_model: "qwen3.5-flash"

# 对话历史滚动摘要配置
max_recent_rounds: 6
force_dequeue_rounds: 16
compress_timeout: 60
compress_max_retries: 2
```

### dynamic_config/models.json

动态模型配置，符合openai标准models列表结构，可以被openai sdk正确读取，支持热重载：
id：唯一必须参数，将提供给前端作为模型选择的参考，并作为请求上游llm端点的model参数包含在请求体中
capabilities：用于前后端之间声明多模态支持
其余参数无意义

```json
{
  "models": [
    {
      "id": "qwen3.5-plus",
      "object": "model",
      "created": 1710000000,
      "owned_by": "bailian",
      "capabilities": ["text", "vision"]
    },
  ]
}
```

### dynamic_config/prompts.yaml

动态 Prompt 配置，支持热重载：

```yaml
system_prompt: |
  你是千问，一个由通义千问开发的 AI 助手。
  ...
```

### 环境变量

| 变量名 | 描述 | 必需 |
|--------|------|------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key | 是（如未在 config.yaml 中配置） |

---

## 安全特性

1. **密码安全**：使用 bcrypt 进行密码哈希，支持 Unicode NFKC 规范化
2. **JWT 认证**：所有 API 端点（除登录/注册外）需要 Bearer Token 认证
3. **所有权验证**：用户只能访问和操作自己的对话
4. **Token 刷新**：支持通过 Cookie 中的 refresh_token 刷新 access_token
5. **密码修改限制**：新密码必须大于 8 位，修改后旧 token 立即失效
6. **用户名修改限制**：每 24 小时只能修改一次（admin 用户不受限制）
7. **API Key 加密存储**：使用 AES-256-GCM 加密存储用户 API Key
8. **速率限制**：登录/注册接口有 IP 速率限制保护
9. **请求体大小限制**：登录/注册接口有请求体大小限制

---

## 输入长度限制

| 接口 | 字段 | 限制 |
|------|------|------|
| login | email | 截断至 254 字符（RFC 5321） |
| login | password | 截断至 120 字符 |
| register | email | 截断至 254 字符 |
| register | username | 截断至 16 字符 |
| register | password | 截断至 120 字符 |
| update_password | new_password | 截断至 120 字符 |
| update_title | title | 截断至 20 个字符 |