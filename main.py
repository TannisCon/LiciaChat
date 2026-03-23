# Copyright (c) 2026 TanisCon
# SPDX-License-Identifier: MIT

from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

import time
import random

from appinit import init_database, REFRESH_TOKEN_EXPIRE_DAYS
from auth import (
    # create_user,
    authenticate_user,
    create_token,
    create_refresh_token,
    # verify_token,
    verify_refresh_token,
    get_user_by_token,
    get_user_by_email,
    # refresh_token,
    update_username,
    update_password,
    User
)
from account import (
    create_invite_code,
    get_invite_codes,
    verify_invite_code,
    delete_invite_code,
    register_user,
    get_user_api_key_info,
    update_user_api_key_handler,
)
from chat import handle_chat_completion
from utils.apikeytool import get_user_api_key
from utils.load_models import get_models
from history import (
    create_chat,
    get_all_chats_by_user,
    get_history_full,
    # get_history_recent,
    # chat_exists,
    get_chat_by_id_and_uuid,
    delete_chat,
    update_chat_title,
    update_chat_current_model,
    ChatNotFoundError,
    ChatAccessDeniedError,
    DatabaseError
)

# 应用生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时初始化数据库
    init_database()
    print("LiciaChat API 已启动")
    yield
    # 关闭时清理资源（如需要）

# 创建 FastAPI 应用
app = FastAPI(
    title="LiciaChat API",
    description="LLM Chat 中间件 API",
    version="0.1.0",
    lifespan=lifespan
)

# =============================================================================
# Rate Limit 配置
# =============================================================================

def get_client_ip(request: Request) -> str:
    """
    获取客户端真实 IP
    
    优先级顺序：
    1. CF-Connecting-IP - Cloudflare 传递的真实 IP
    2. X-Forwarded-For - 第一个 IP（最左侧）
    3. 直接连接的 IP
    """
    # 1. 检查 CF-Connecting-IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip
    
    # 2. 检查 X-Forwarded-For (取第一个 IP)
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    
    # 3. 使用直接连接的 IP
    return request.client.host if request.client else "unknown"


# 创建限流器
limiter = Limiter(key_func=get_client_ip)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


# =============================================================================
# 请求体大小限制中间件
# =============================================================================

class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """限制特定路径的请求体大小"""
    def __init__(self, app, max_body_size: int, path: str):
        super().__init__(app)
        self.max_body_size = max_body_size
        self.path = path
    
    async def dispatch(self, request, call_next):
        if request.url.path == self.path:
            content_length = int(request.headers.get("content-length", 0))
            if content_length > self.max_body_size:
                raise HTTPException(
                    status_code=413,
                    detail="请求体过大"
                )
        return await call_next(request)


# 限制 login 接口请求体大小为 1KB（邮箱 + 密码最多约 200 字符）
app.add_middleware(MaxBodySizeMiddleware, max_body_size=1024, path="/api/auth/login")

# 限制 register 接口请求体大小为 2KB（邀请码 + 邮箱 + 用户名 + 密码 + api_key + key_provider + base_url）
app.add_middleware(MaxBodySizeMiddleware, max_body_size=2048, path="/api/auth/register")

# 自定义异常处理 - 使用 HTTPException 抛出 429 错误
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    raise HTTPException(
        status_code=429,
        detail="请求过于频繁，请稍后再试"
    )

# HTTP Bearer 认证
security = HTTPBearer(auto_error=False)


# 依赖项：验证 token
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """获取当前认证用户"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证凭证"
        )
    
    token = credentials.credentials
    user = get_user_by_token(token)
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或过期的 token"
        )
    
    return user


# 请求/响应模型
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    refresh_token_in_cookie: bool = True  # 表示 refresh token 已通过 Cookie 设置


class RegisterRequest(BaseModel):
    invite_code: str
    email: EmailStr
    username: str
    password: str
    api_key: str
    key_provider: str
    base_url: str


class UserResponse(BaseModel):
    uid: int
    uuid: str
    email: str
    username: str
    role: str
    created_at: str


class RefreshRequest(BaseModel):
    # 不再需要 access_token，从 Cookie 读取 refresh_token
    pass


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UpdateTitleRequest(BaseModel):
    title: str


class UpdateTitleResponse(BaseModel):
    chat_id: str
    title: str


class UpdateChatInfoRequest(BaseModel):
    title: Optional[str] = None
    current_model: Optional[str] = None


class UpdateChatInfoResponse(BaseModel):
    chat_id: str
    title: Optional[str] = None
    current_model: Optional[str] = None


class UpdateUsernameRequest(BaseModel):
    username: str


class UpdatePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdatePasswordResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # user: dict
    refresh_token_in_cookie: bool = True


# =============================================================================
# 邀请码相关请求/响应模型
# =============================================================================

class CreateInviteCodeRequest(BaseModel):
    type: str = "user"  # 邀请码类型："user"或"trusted"
    expires_days: int = 0  # 有效期天数，0 表示不过期
    max_uses: int = 1  # 最大使用次数，0 表示无限制
    note: Optional[str] = None  # 备注


class CreateInviteCodeResponse(BaseModel):
    code: str  # 创建的邀请码


class InviteCodeItem(BaseModel):
    code: str
    user_id: str
    type: str
    created_at: str
    used_by: list
    used_at: list
    uses: int
    max_uses: int
    expires_at: Optional[str]
    note: Optional[str]


class GetInviteCodesResponse(BaseModel):
    codes: list[InviteCodeItem]


class DeleteInviteCodeResponse(BaseModel):
    message: str


# =============================================================================
# API Key 相关请求/响应模型
# =============================================================================

class GetApiKeyInfoResponse(BaseModel):
    api_key_masked: Optional[str] = None
    status: str  # valid|quota|invalid|pending
    provider: str  # bailian|vllm
    base_url: str
    updated_at: Optional[str] = None  # ISO 格式字符串


class UpdateApiKeyRequest(BaseModel):
    action: str  # "update" 或 "clear"
    api_key: Optional[str] = None  # update 操作时必需
    provider: Optional[str] = None  # update 操作时必需
    base_url: Optional[str] = None  # update 操作时必需


class UpdateApiKeyResponse(BaseModel):
    api_key_masked: Optional[str] = None
    status: str
    provider: str
    base_url: str
    updated_at: Optional[str] = None




@app.get("/")
def root():
    """根路由"""
    return {"message": "LiciaChat API", "version": "0.1.0"}


@app.post("/api/auth/register", response_model=UserResponse)
@limiter.limit("5/minute")  # IP 限流：每分钟最多 5 次
def register(request: Request, register_request: RegisterRequest, response: Response):
    """用户注册（BYOK 模式）
    
    需要有效的邀请码，注册成功后返回用户信息和 access_token
    
    Rate Limit:
    - IP 限流：每分钟最多 5 次
    
    请求体大小限制:
    - 最大 2KB
    
    请求体:
        invite_code: 邀请码
        email: 用户邮箱（必须为合法邮箱格式，不超过 254 字符）
        username: 用户名
        password: 密码（超过 120 字符会截断）
        api_key: 用户提供的 API Key
        key_provider: Key 提供商 ("bailian" 或 "vllm")
        base_url: API Base URL
    
    处理流程:
        1. 检查注册功能是否开启
        2. 验证邮箱格式（使用 email-validator）
        3. 邮箱转小写，检查长度不超过 254 字符
        4. 密码截断至 120 字符
        5. 验证邀请码有效性
        6. 验证 key_provider 为 "bailian" 或 "vllm"
        7. probe 检查 API Key
        8. 如果 valid，创建用户并存储加密的 API Key
    """
    # 调用 account 模块的注册逻辑
    result = register_user(
        invite_code=register_request.invite_code,
        email=register_request.email,
        username=register_request.username,
        password=register_request.password,
        api_key=register_request.api_key,
        key_provider=register_request.key_provider,
        base_url=register_request.base_url
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "注册失败")
        )
    
    user_data = result["user"]
    
    # 生成 access token
    access_token = create_token(user_data["email"])
    
    # 生成 refresh token 并设置为 HttpOnly Cookie
    refresh_token_value = create_refresh_token(user_data["email"])
    
    # 设置 Cookie 参数
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_value,
        httponly=True,
        secure=False,  # MVP 简化，生产环境应设为 True 并使用 HTTPS
        samesite="lax",
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,  # 使用配置文件中的配置
        path="/"
    )
    
    return UserResponse(
        uid=user_data["uid"],
        uuid=user_data["uuid"],
        email=user_data["email"],
        username=user_data["username"],
        role=user_data["role"],
        created_at=user_data["created_at"]
    )


@app.post("/api/auth/login")
@limiter.limit("5/minute")  # IP 限流：每分钟最多 5 次
def login(request: Request, login_request: LoginRequest, response: Response):
    """用户登录
    
    成功后返回 access_token，并通过 HttpOnly Cookie 设置 refresh_token
    
    Rate Limit:
    - IP 限流：每分钟最多 5 次（按 CF-Connecting-IP > X-Forwarded-For > 直接 IP 顺序获取）
    
    输入长度限制:
    - email: 截断至 254 位（RFC 5321 规定的邮箱最大长度）
    - password: 截断至 120 位
    """
    # 对邮箱和密码进行长度截断
    email = login_request.email.lower().strip()[:254]
    password = login_request.password[:120]
    
    user = authenticate_user(email, password)
    
    if user is None:
        time.sleep(random.uniform(0.2, 0.6))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误"
        )
    
    # 生成 access token
    access_token = create_token(user.email)
    
    # 生成 refresh token 并设置为 HttpOnly Cookie
    refresh_token_value = create_refresh_token(user.email)
    
    # 设置 Cookie 参数
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_value,
        httponly=True,
        secure=False,  # MVP 简化，生产环境应设为 True 并使用 HTTPS
        samesite="lax",
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,  # 使用配置文件中的配置
        path="/"
    )
    
    return LoginResponse(
        access_token=access_token,
        user={
            "uid": user.uid,
            "uuid": user.uuid,
            "email": user.email,
            "username": user.username,
            "role": user.role
        },
        refresh_token_in_cookie=True
    )


@app.get("/api/user/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse(
        uid=current_user.uid,
        uuid=current_user.uuid,
        email=current_user.email,
        username=current_user.username,
        role=current_user.role,
        created_at=current_user.created_at.isoformat()
    )


@app.patch("/api/user/me", response_model=UserResponse)
def update_username_endpoint(
    request: UpdateUsernameRequest,
    current_user: User = Depends(get_current_user)
):
    """更新当前用户名
    
    需要有效的 token 认证
    用户名每 24 小时只能修改一次（admin 用户不受限制）
    """
    # 检查新用户名是否为空
    if not request.username or not request.username.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名不能为空"
        )
    
    # 调用 auth.py 中的函数更新用户名
    result = update_username(current_user.email, request.username)
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "更新用户名失败")
        )
    
    user_data = result["user"]
    return UserResponse(
        uid=user_data["uid"],
        uuid=user_data["uuid"],
        email=user_data["email"],
        username=user_data["username"],
        role=user_data["role"],
        created_at=user_data["created_at"]
    )


@app.patch("/api/user/password", response_model=UpdatePasswordResponse)
def update_password_endpoint(
    request: UpdatePasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user)
):
    """更新当前用户密码
    
    需要有效的 token 认证
    新密码长度必须大于 8 位
    修改成功后会返回新的 access_token 和 refresh_token
    """
    # 调用 auth.py 中的函数更新密码
    result = update_password(current_user.email, request.old_password, request.new_password)
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "更新密码失败")
        )
    
    # 生成新的 access token
    new_access_token = create_token(current_user.email)
    
    # 生成新的 refresh token 并设置为 HttpOnly Cookie
    new_refresh_token = create_refresh_token(current_user.email)
    
    # 设置 Cookie 参数
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=False,  # MVP 简化，生产环境应设为 True 并使用 HTTPS
        samesite="lax",
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,  # 使用配置文件中的配置
        path="/"
    )
    
    user_data = result["user"]
    return UpdatePasswordResponse(
        access_token=new_access_token,
        # user={
        #     "uid": user_data["uid"],
        #     "uuid": user_data["uuid"],
        #     "email": user_data["email"],
        #     "username": user_data["username"],
        #     "role": user_data["role"]
        # },
        refresh_token_in_cookie=True
    )


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    """用户登出
    
    清除 refresh token cookie
    无需 access token 认证（前端可能已清除 access token）
    
    处理流程:
        1. 清除 refresh_token cookie
    """
    # 清除 refresh_token cookie
    response.delete_cookie(
        key="refresh_token",
        path="/",
        domain=None  # 使用当前域名
    )
    
    # 也尝试清除 /api/auth 路径的 cookie（兼容之前可能的设置）
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth",
        domain=None
    )
    
    return {
        "message": "OK",
        "logged_out": True
    }


@app.post("/api/auth/refresh", response_model=RefreshResponse)
def refresh_access_token(request: Request, response: Response):
    """刷新 access token 和 refresh token
    
    从 Cookie 读取 refresh_token，验证后生成新的 access_token 和 refresh_token
    无需 access_token 鉴权
    """
    # 从 Cookie 读取 refresh_token
    refresh_token_value = request.cookies.get("refresh_token")
    
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供有效的认证信息"
        )
    
    # 验证 refresh token
    payload = verify_refresh_token(refresh_token_value)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token 无效或已过期"
        )
    
    email = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供有效的认证信息"
        )
    
    # 检查用户是否存在
    user = get_user_by_email(email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户认证失败"
        )
    
    # 生成新的 access token
    new_access_token = create_token(email)
    
    # 生成新的 refresh token 并更新 Cookie
    new_refresh_token = create_refresh_token(email)
    
    # 更新 Cookie 参数
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=False,  # MVP 简化，生产环境应设为 True 并使用 HTTPS
        samesite="lax",
        max_age=60 * 60 * 24 * REFRESH_TOKEN_EXPIRE_DAYS,  # 使用配置文件中的配置
        path="/api/auth"
    )
    
    return RefreshResponse(access_token=new_access_token)


@app.post("/api/chat")
def create_new_chat(current_user: User = Depends(get_current_user)):
    """创建新对话
    
    对于 BYOK 用户（非 admin），会检查 API Key 状态：
    - 未找到记录：401
    - pending/invalid 状态：401
    - quota 状态：429
    
    返回一个新的 chat_id
    """
    # 对于 BYOK 用户（非 admin），检查 API Key 状态
    if current_user.role != "admin":
        api_key_record = get_user_api_key(current_user)
        
        if api_key_record is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="未找到 API Key 记录，请先配置您的 API Key"
            )
        
        if api_key_record.status in ["pending", "invalid"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="您的 API Key 无效或待验证，请检查您的 API Key"
            )
        
        if api_key_record.status == "quota":
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="您的 API Key 配额不足，请检查您的 API Key"
            )
    
    chat = create_chat(current_user.uuid)
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建对话失败"
        )
    
    return {
        "chat_id": chat.chat_id,
        "title": chat.title,
        "created_at": chat.created_at
    }


@app.get("/api/chat")
def list_chats(current_user: User = Depends(get_current_user)):
    """获取用户的所有对话列表
    返回 chat_id 和 title 的列表，按更新时间降序
    """
    chats = get_all_chats_by_user(current_user.uuid)
    
    return {
        "chats": [
            {
                "chat_id": chat.chat_id,
                "title": chat.title,
                "created_at": chat.created_at,
                "updated_at": chat.updated_at
            }
            for chat in chats
        ]
    }


@app.get("/api/chat/{chat_id}")
def get_chat_history(chat_id: str, current_user: User = Depends(get_current_user)):
    """获取指定对话的完整历史记录
    
    返回：
        - chat_id: 对话 ID
        - title: 对话标题
        - current_model: 当前使用的模型 ID
        - history: 完整对话历史
    """
    # 验证对话存在且属于当前用户
    chat = get_chat_by_id_and_uuid(chat_id, current_user.uuid)
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在或无权访问"
        )
    
    history = get_history_full(chat_id)
    if history is None:
        history = []
    
    return {
        "chat_id": chat_id,
        "title": chat.title,
        "current_model": chat.current_model,
        "history": history
    }


@app.delete("/api/chat/{chat_id}")
def delete_chat_endpoint(chat_id: str, current_user: User = Depends(get_current_user)):
    """删除指定对话
    
    需要有效的 token 认证，只能删除用户自己的对话
    """
    # 验证对话存在且属于当前用户
    chat = get_chat_by_id_and_uuid(chat_id, current_user.uuid)
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在或无权访问"
        )
    
    # 执行删除
    success = delete_chat(chat_id, current_user.uuid)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除对话失败"
        )
    
    return {
        "message": "对话已成功删除",
        "chat_id": chat_id
    }


@app.patch("/api/chat/{chat_id}", response_model=UpdateChatInfoResponse)
def update_chat_info_endpoint(
    chat_id: str,
    request: UpdateChatInfoRequest,
    current_user: User = Depends(get_current_user)
):
    """更新对话信息（标题或模型）
    
    需要有效的 token 认证，只能修改用户自己的对话
    title 和 current_model 至少提供一个，title 超过 20 个字符会被自动截断
    """
    # 验证至少提供一个字段
    if request.title is None and request.current_model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="必须提供 title 或 current_model 至少一个字段"
        )
    
    # 验证非空
    if request.title is not None and (not request.title or not request.title.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="标题不能为空"
        )
    
    if request.current_model is not None and (not request.current_model or not request.current_model.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型 ID 不能为空"
        )
    
    try:
        # 更新标题
        if request.title is not None:
            update_chat_title(chat_id, request.title, current_user.uuid)
        
        # 更新模型
        if request.current_model is not None:
            update_chat_current_model(chat_id, request.current_model, current_user.uuid)
        
        # 返回更新后的信息
        return UpdateChatInfoResponse(
            chat_id=chat_id,
            title=request.title,
            current_model=request.current_model
        )
    except ChatNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在"
        )
    except ChatAccessDeniedError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="无权访问该对话"
        )
    except DatabaseError as e:
        print(f"更新对话信息时数据库错误：{e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新对话信息失败，请稍后重试"
        )
    except Exception as e:
        print(f"更新对话信息时发生未预期的错误：{e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新对话信息失败"
        )


@app.post("/api/chat/{chat_id}/completions")
async def chat_completions_with_history(chat_id: str, request: Request, current_user: User = Depends(get_current_user)):
    """带持久化的 Chat Completions API
    
    支持 OpenAI Chat Completions API 标准格式请求体
    
    请求体字段说明:
        - model: 可选，未指定时使用后端配置的 MAIN_LLM_MODEL
        - messages: 必需，消息数组，提取最后一条 user 角色的 content 字段
        - enable_thinking: 可选，布尔值，是否启用推理模式（默认 False）
          支持两种格式：
          1. 顶层：{"enable_thinking": true}，仅为兼容性保证
          2. 嵌套：{"extra_body": {"enable_thinking": true}}（推荐使用的 OpenAI SDK 标准格式）
        
        以下 OpenAI 标准字段会被接收但忽略，使用后端默认配置：
        - temperature/max_tokens/top_p 等：忽略，使用上游模型默认值
        - system message: 忽略，使用后端动态配置文件中的 SYSTEM_PROMPT
    
    处理流程:
        1. 验证 chat_id 存在且属于当前用户（404 如果不存在或无权访问）
        2. 获取历史对话（compressed + recent）并拼接 system prompt
        3. 提取 messages 中最后一条 user message 追加到对话
        4. 转发到 LLM API（使用用户的 BYOK API Key 或全局配置）
        5. 流式响应（SSE 格式，符合 OpenAI 标准）
        6. 完成后将对话保存到数据库 - 同时后端异步处理对话标题生成和对话历史摘要
    
    响应格式:
        - 仅支持 SSE 流式响应，Content-Type: text/event-stream
        - 符合 OpenAI Chat Completion Stream 格式
        - 包含 usage 统计信息（标准化格式，兼容多厂商）
    
    BYOK 用户处理:
        - 非 admin 用户需要配置有效的 API Key
        - API Key 状态检查：pending/invalid 返回 401，quota 返回 429
    
    认证:
        - 需要 Bearer Token（Access Token）
    """
    # 验证对话存在且属于当前用户
    chat = get_chat_by_id_and_uuid(chat_id, current_user.uuid)
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在或无权访问"
        )
    
    return await handle_chat_completion(request, current_user, chat_id=chat_id)


@app.get("/v1/models")
def list_models(current_user: User = Depends(get_current_user)):
    """获取可用模型列表（OpenAI 兼容格式）
    
    需要有效的 access token 认证
    返回 OpenAI 标准的模型列表格式，从 dynamic_config/models.json 动态加载
    支持热重载：修改 models.json 后无需重启服务即可生效
    """
    return get_models()


@app.post("/v1/chat/completions")
async def chat_completions(request: Request, current_user: User = Depends(get_current_user)):
    """OpenAI 兼容的 Chat Completions API（无状态单轮对话模式）
    
    支持 OpenAI Chat Completions API 标准格式请求体
    仅支持无状态的单轮对话，用于 Probe 和测试场景
    
    请求体字段说明:
        - model: 可选，未指定时使用后端配置的 MAIN_LLM_MODEL
        - messages: 必需，消息数组，提取最后一条 user 角色的 content 字段
        - enable_thinking: 可选，布尔值，是否启用推理模式
          支持两种格式：顶层 或 extra_body.enable_thinking
        - 其他 OpenAI 标准字段（temperature 等）会被忽略
    
    响应格式:
        - 仅支持 SSE 流式响应，符合 OpenAI 标准格式
        - 包含 usage 统计信息（标准化格式）
    
    认证:
        - 需要 Bearer Token（Access Token）
    """
    return await handle_chat_completion(request, current_user)


# =============================================================================
# 邀请码相关 API
# =============================================================================

@app.post("/api/user/invite", response_model=CreateInviteCodeResponse)
def create_invite_code_endpoint(
    request: CreateInviteCodeRequest,
    current_user: User = Depends(get_current_user)
):
    """创建邀请码
    
    需要有效的 access token 认证
    只有 admin 或 trusted 用户可以创建邀请码
    
    权限规则:
    - admin: 可创建 user 或 trusted 类型，有效期无限制，max_uses 可为 0(无限)
    - trusted: 只能创建 user 类型，有效期最多 30 天，max_uses 最多 10，不能为 0
    
    Args:
        type: 邀请码类型 ("user"或"trusted")
        expires_days: 有效期天数，0 表示不过期
        max_uses: 最大使用次数，0 表示无限制
        note: 备注信息 (可选，大于 255 字符会截断)
    """
    # 检查用户权限
    if current_user.role not in ["admin", "trusted"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权创建邀请码"
        )
    
    # 调用 account 模块创建邀请码
    result = create_invite_code(
        creator_uuid=current_user.uuid,
        creator_role=current_user.role,
        invite_type=request.type,
        expires_days=request.expires_days,
        max_uses=request.max_uses,
        note=request.note
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "创建邀请码失败")
        )
    
    return CreateInviteCodeResponse(code=result["code"])


@app.get("/api/user/invite", response_model=GetInviteCodesResponse)
def get_invite_codes_endpoint(current_user: User = Depends(get_current_user)):
    """获取邀请码列表
    
    需要有效的 access token 认证
    只有 admin 或 trusted 用户可以访问
    
    admin 用户返回所有邀请码
    其他用户只返回自己创建的邀请码
    """
    # 检查用户权限
    if current_user.role not in ["admin", "trusted"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权查看邀请码列表"
        )
    
    # 调用 account 模块获取邀请码列表
    result = get_invite_codes(
        user_uuid=current_user.uuid,
        user_role=current_user.role
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "获取邀请码列表失败")
        )
    
    return GetInviteCodesResponse(codes=result["codes"])


@app.delete("/api/user/invite/{code}", response_model=DeleteInviteCodeResponse)
def delete_invite_code_endpoint(code: str, current_user: User = Depends(get_current_user)):
    """删除邀请码
    
    需要有效的 access token 认证
    只有 admin 或 trusted 用户可以访问
    
    admin 可删除任何人创建的邀请码
    其他用户只能删除自己创建的邀请码
    
    注意：生产环境应启用使用次数检查，防止审计链断裂
    """
    # 检查用户权限
    if current_user.role not in ["admin", "trusted"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权删除邀请码"
        )
    
    # 调用 account 模块删除邀请码
    result = delete_invite_code(
        code=code,
        user_uuid=current_user.uuid,
        user_role=current_user.role
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "删除邀请码失败")
        )
    
    return DeleteInviteCodeResponse(message="邀请码已成功删除")


# =============================================================================
# API Key 相关 API
# =============================================================================

@app.get("/api/user/apikey", response_model=GetApiKeyInfoResponse)
def get_api_key_info(current_user: User = Depends(get_current_user)):
    """获取当前用户的 API Key 信息
    
    需要有效的 access token 认证
    
    返回:
        - api_key_masked: 掩码后的 API Key
        - status: API Key 状态 (valid|quota|invalid|pending)
        - provider: 提供商 (bailian|vllm)
        - base_url: API Base URL
        - updated_at: 最后修改时间
    
    特殊处理:
        - admin 用户返回系统级配置信息
    """
    # 调用 account 模块获取 API Key 信息
    result = get_user_api_key_info(current_user)
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result.get("error", "获取 API Key 信息失败")
        )
    
    data = result["data"]
    return GetApiKeyInfoResponse(
        api_key_masked=data["api_key_masked"],
        status=data["status"],
        provider=data["provider"],
        base_url=data["base_url"],
        updated_at=data["updated_at"]
    )


@app.post("/api/user/apikey", response_model=UpdateApiKeyResponse)
def update_api_key(
    request: UpdateApiKeyRequest,
    current_user: User = Depends(get_current_user)
):
    """更新或清除当前用户的 API Key
    
    需要有效的 access token 认证
    
    请求参数:
        - action: 操作类型 ("update" 或 "clear")
        - api_key: 明文 API Key（update 操作时必需）
        - provider: Key 提供商（update 操作时必需）
        - base_url: API Base URL（update 操作时必需）
    
    注意:
        - 两次操作间隔必须大于 15 秒
        - update 操作会先通过 probe 验证 API Key 有效性
        - admin 用户返回"系统设置无法在线修改"错误
    """
    # 验证 action 参数
    if request.action not in ["update", "clear"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的请求参数"
        )
    
    # 调用 account 模块处理 API Key 更新/清除
    result = update_user_api_key_handler(
        user=current_user,
        action=request.action,
        api_key_plaintext=request.api_key,
        provider=request.provider,
        base_url=request.base_url
    )
    
    if not result["success"]:
        # 根据 error_code 返回不同的 HTTP 状态码
        error_code: Optional[str] = result.get("error_code")
        error_msg: str = result.get("error", "操作失败")
        
        # 错误代码映射
        error_code_to_status = {
            "admin_forbidden": status.HTTP_403_FORBIDDEN,
            "rate_limit": status.HTTP_429_TOO_MANY_REQUESTS,
            "invalid_params": status.HTTP_400_BAD_REQUEST,
            "probe_failed": status.HTTP_400_BAD_REQUEST,
            "quota_exceeded": status.HTTP_400_BAD_REQUEST,
            "storage_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
            "invalid_action": status.HTTP_400_BAD_REQUEST,
        }
        
        # 获取 HTTP 状态码，默认为 400
        http_status = error_code_to_status.get(error_code, status.HTTP_400_BAD_REQUEST) if error_code else status.HTTP_400_BAD_REQUEST
        
        raise HTTPException(
            status_code=http_status,
            detail=error_msg
        )
    
    data = result["data"]
    return UpdateApiKeyResponse(
        api_key_masked=data["api_key_masked"],
        status=data["status"],
        provider=data["provider"],
        base_url=data["base_url"],
        updated_at=data["updated_at"]
    )


if __name__ == "__main__":
    import uvicorn
    # 直接执行 main.py 将启动 Uvicorn，开发环境建议使用 uvicorn main:app --reload 启动避免uvicorn出错，生产环境请使用 Gunicorn + Uvicorn Worker
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000
    )
# 