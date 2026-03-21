# LiciaChat 数据库结构文档

本文档详细描述了 LiciaChat 项目的数据库结构，包括所有数据表、字段定义、JSON 字段结构说明以及相关的数据关系。

## 概述

LiciaChat 使用 SQLite 作为数据库，通过 SQLModel ORM 进行数据操作。数据库文件位于项目根目录的 `database.db`。

---

## 数据表总览

| 表名 | 模型类 | 描述 |
|------|--------|------|
| `user` | User | 用户账户表 |
| `chat` | Chat | 对话记录表 |
| `invitecode` | InviteCode | 邀请码表 |
| `apikey` | ApiKey | 用户 API Key 表 |

---

## 数据表详细结构

### 1. user - 用户表

存储用户账户信息，包括认证凭据、角色和扩展信息。

#### 字段定义

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| `uid` | int | PRIMARY KEY, AUTO INCREMENT | 自增主键，从 10000 开始 |
| `uuid` | str | UNIQUE, INDEX | UUIDv4 格式的唯一标识符，关联其他表使用 |
| `email` | str | UNIQUE, INDEX | 用户邮箱，唯一且作为登录标识 |
| `username` | str | NOT NULL | 用户名，≤16 字符，可修改，仅用于展示 |
| `password_hash` | str | NOT NULL | 密码哈希值，使用 bcrypt 加密存储 |
| `role` | str | DEFAULT "user" | 用户角色："user" / "trusted" / "admin" |
| `created_at` | datetime | DEFAULT utcnow() | 账户创建时间 (UTC) |
| `private` | str (JSON) | DEFAULT "[]" | 用户扩展信息，JSON 字符串 |
| `password_changed_at` | datetime | NULLABLE | 密码最后修改时间 (UTC) |

#### `private` 字段 JSON 结构

`private` 字段存储用户的扩展信息，格式为 JSON 对象（字典）：

```json
{
  "invited_by": "邀请者邮箱",
  "username_changed_at": "2024-01-01T00:00:00",
  "api_key_masked": "sk-1234************cdef"
}
```

| 键名 | 类型 | 说明 |
|------|------|------|
| `invited_by` | string | 邀请该用户注册的用户邮箱 |
| `username_changed_at` | string (ISO 8601) | 用户名上次修改时间，用于限制修改频率（24 小时内只能修改一次） |
| `api_key_masked` | string | 掩码后的 API Key，保留前 8 位和后 4 位 |

#### 角色说明

| 角色 | 说明 |
|------|------|
| `admin` | 管理员，使用系统级 API Key 配置，无法在线修改 |
| `trusted` | 授信用户，可创建邀请码，BYOK 模式 |
| `user` | 普通用户，BYOK 模式 |

---

### 2. chat - 对话表

存储用户对话记录，包括标题、时间戳和历史记录。

#### 字段定义

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| `chat_id` | str | PRIMARY KEY | 对话唯一标识符，格式："chat-" + UUIDv7 |
| `uuid` | str | FOREIGN KEY → user.uuid, INDEX | 关联 user 表的 uuid |
| `title` | str | DEFAULT "新对话" | 对话标题，默认"新对话"，后续异步更新为生成的标题 |
| `current_model` | str | DEFAULT MAIN_LLM_MODEL | 当前对话使用的模型 ID |
| `created_at` | int | DEFAULT timestamp() | 对话创建时间戳 (Unix 秒) |
| `updated_at` | int | DEFAULT timestamp() | 对话最后更新时间戳 (Unix 秒) |
| `history_recent` | str (JSON) | DEFAULT "[]" | 最近对话历史（保留最近 N 轮） |
| `history_full` | str (JSON) | DEFAULT "[]" | 完整对话历史 |
| `history_compressed` | str (JSON) | DEFAULT "[]" | 压缩摘要历史 |
| `total_rounds` | int | NULLABLE | 对话总轮次（功能待实现） |
| `total_tokens` | int | NULLABLE | 对话总 tokens 数（功能待实现） |

#### `history_recent` 字段 JSON 结构

存储最近对话轮次的历史记录，格式为消息列表：

```json
[
  {"role": "user", "content": "用户消息内容"},
  {"role": "assistant", "content": "助手回复内容"},
  {"role": "user", "content": "下一轮用户消息"},
  {"role": "assistant", "content": "下一轮助手回复"}
]
```

#### `current_model` 字段说明

存储当前对话使用的模型 ID，支持用户在对话过程中切换模型：

```json
"qwen3.5-plus"  // 或其他配置的模型 ID
```

#### `history_full` 字段 JSON 结构

与 `history_recent` 格式相同，但包含完整对话历史：

```json
[
  {"role": "user", "content": "第一轮用户消息"},
  {"role": "assistant", "content": "第一轮助手回复"},
  {"role": "user", "content": "第二轮用户消息"},
  {"role": "assistant", "content": "第二轮助手回复"}
  // ... 所有历史对话
]
```

#### `history_compressed` 字段 JSON 结构

存储压缩摘要历史，包含 round 元数据：

```json
[
  {"round": 1},
  {"role": "user", "content": "第一轮对话摘要"},
  {"role": "assistant", "content": "第一轮回复摘要"},
  {"round": 2},
  {"role": "user", "content": "第二轮对话摘要"},
  {"role": "assistant", "content": "第二轮回复摘要"}
]
```

#### 对话历史管理机制

1. **最近历史轮数限制**：由配置项 `max_recent_rounds` 控制（默认 6 轮）
2. **强制出队轮数**：由配置项 `force_dequeue_rounds` 控制（默认 16 轮）
3. **压缩机制**：
   - 当 `history_recent` 超过 `max_recent_rounds` 时，触发异步压缩
   - 使用 `lite_llm_model` 对队头对话进行结构化摘要
   - 摘要追加到 `history_compressed`
   - 如果压缩超时或失败，使用全量对话

---

### 3. invitecode - 邀请码表

存储用户生成的邀请码，用于控制用户注册。

#### 字段定义

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| `code` | str | PRIMARY KEY, UNIQUE, INDEX | 12 字符 Base32 编码邀请码 |
| `user_id` | str | FOREIGN KEY → user.uuid, INDEX | 创建该邀请码的用户 uuid |
| `type` | str | DEFAULT "user" | 邀请码类型："user" 或 "trusted" |
| `created_at` | datetime | DEFAULT utcnow() | 邀请码创建时间 (UTC) |
| `used_by` | str (JSON) | DEFAULT "[]" | 使用该邀请码注册的用户邮箱列表 |
| `used_at` | str (JSON) | DEFAULT "[]" | 邀请码被使用的时间列表 (UTC) |
| `uses` | int | DEFAULT 0 | 已使用次数 |
| `max_uses` | int | DEFAULT 1 | 最大使用次数，0 表示无限制 |
| `expires_at` | datetime | NULLABLE | 过期时间 (UTC)，NULL 表示不过期 |
| `note` | str | NULLABLE, MAX 255 | 备注信息，最多 255 字符 |

#### `used_by` 字段 JSON 结构

存储使用该邀请码注册的用户邮箱列表：

```json
["user1@example.com", "user2@example.com", "user3@example.com"]
```

#### `used_at` 字段 JSON 结构

存储邀请码被使用的时间列表（ISO 8601 格式）：

```json
["2024-01-01T10:00:00", "2024-01-02T15:30:00", "2024-01-03T09:15:00"]
```

#### 邀请码类型和使用限制

| 创建者角色 | 可创建类型 | 有效期限制 | max_uses 限制 |
|------------|------------|------------|---------------|
| `admin` | user / trusted | 无限制 | 可为 0（无限） |
| `trusted` | 仅 user | 最多 30 天 | 最多 10 次，不能为 0 |

---

### 4. apikey - 用户 API Key 表

存储用户提供的 API Key（加密存储），用于 BYOK（Bring Your Own Key）模式。

#### 字段定义

| 字段名 | 类型 | 约束 | 描述 |
|--------|------|------|------|
| `user_id` | str | PRIMARY KEY, FOREIGN KEY → user.uuid, INDEX | 关联 user 表的 uuid |
| `provider` | str | DEFAULT "bailian" | Key 对应提供商："bailian" 或 "vllm" |
| `base_url` | str | NOT NULL | Key 对应提供商的 API Base URL |
| `encrypted_key` | bytes | NOT NULL | AES-256-GCM 加密后的密文 |
| `iv` | bytes | NOT NULL | AES 加密的初始化向量（12 字节） |
| `tag` | bytes | NOT NULL | AES-GCM 的认证标签（16 字节） |
| `updated_at` | datetime | DEFAULT utcnow() | Key 创建或最后更新时间 (UTC) |
| `status` | str | DEFAULT "pending" | Key 状态："pending" / "valid" / "quota" / "invalid" |

#### API Key 状态说明

| 状态 | 说明 |
|------|------|
| `pending` | 待验证状态，新创建或清除后重置 |
| `valid` | 有效状态，probe 检查通过 |
| `quota` | 配额不足，API Key 余额不足或套餐限制 |
| `invalid` | 无效状态，probe 检查失败 |

#### 加密说明

- **加密算法**：AES-256-GCM
- **密钥来源**：`config.yaml` 中的 `api_key_encryption_key`（32 字节）
- **IV 大小**：12 字节（GCM 推荐大小）
- **Tag 大小**：16 字节
- **密文存储**：`encrypted_key` 字段存储不含 tag 的密文，tag 单独存储

---

## 表关系图

```
┌─────────────┐
│    user     │
│             │
│  uid (PK)   │
│  uuid (UK)  │──┐
│  email (UK) │  │
│  username   │  │
│  ...        │  │
└─────────────┘  │
                 │
        ┌────────┼────────────────┐
        │        │                │
        ▼        ▼                ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    chat     │ │ invitecode  │ │   apikey    │
│             │ │             │ │             │
│ chat_id(PK) │ │ code (PK)   │ │ user_id(PK) │
│ uuid (FK)   │ │ user_id(FK) │ │ (FK→uuid)   │
│ ...         │ │ ...         │ │ ...         │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## 配置项相关

以下配置项（来自 `config.yaml`）影响数据库行为：

### 对话历史配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `max_recent_rounds` | 6 | `history_recent` 保留的最大对话轮数 |
| `force_dequeue_rounds` | 16 | 强制出队的对话轮数阈值 |
| `compress_timeout` | 60 | 对话压缩超时时间（秒） |
| `compress_max_retries` | 2 | 对话压缩最大重试次数 |

### 模型配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `main_llm_model` | "qwen3.5-plus" | 主 LLM 模型，用于对话 |
| `lite_llm_model` | "qwen3.5-flash" | 轻量 LLM 模型，用于摘要和标题生成 |

### 动态配置

动态配置文件位于 `dynamic_config/` 目录，支持热重载：

| 文件 | 格式 | 说明 |
|------|------|------|
| `models.json` | JSON | 可用模型列表，符合 OpenAI 标准格式 |
| `prompts.yaml` | YAML | System Prompt 等 Prompt 模板 |

### JWT 配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `jwt_secret` | "change-this-secret-key-in-production" | JWT 签名密钥 |
| `jwt_algorithm` | "HS256" | JWT 签名算法 |
| `jwt_expire_minutes` | 30 | Access Token 有效期（分钟） |
| `refresh_token_expire_days` | 30 | Refresh Token 有效期（天） |

### 用户注册配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `registration_enabled` | false | 是否启用用户注册功能 |

---

## 初始化数据

数据库初始化时会自动创建默认管理员账户：

| 字段 | 值 |
|------|-----|
| `uid` | 10000 |
| `uuid` | UUIDv4 自动生成 |
| `email` | 来自配置的 `admin_email` |
| `username` | "admin" |
| `password` | "password"（默认密码） |
| `role` | "admin" |

---

## 安全注意事项

1. **密码存储**：使用 bcrypt 哈希存储，不得明文保存
2. **API Key 存储**：使用 AES-256-GCM 加密存储，密钥来自配置文件
3. **敏感日志**：不得将 API Key 明文记录到日志中
4. **邮箱处理**：存储前转换为小写，确保一致性

---

## 版本历史

| 日期 | 版本 | 说明 |
|------|------|------|
| 2024-03-17 | 1.0.0 | 初始文档 |

---

*本文档由 AI 自动生成，最后更新时间：2026-03-21*
