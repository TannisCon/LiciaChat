"""
用户账户和邀请码管理模块
"""
import os
import uuid
import json
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from sqlmodel import SQLModel, Session, select
from sqlalchemy import desc as sa_desc

from email_validator import validate_email, EmailNotValidError

from appinit import (
    get_engine,
    SessionLocal,
    User,
    InviteCode,
    ApiKey,
    REGISTRATION_ENABLED,
    DASHSCOPE_BASE_URL,
)
from auth import get_user_by_email

from utils.apikeytool import probe_api_key, update_user_api_key, get_user_api_key

from auth import hash_password


# =============================================================================
# 邀请码生成工具
# =============================================================================

def _generate_base32_code(length: int = 12) -> str:
    """生成指定长度的 Base32 编码字符串
    
    使用 secrets.token_bytes 生成加密安全的随机字节，
    然后使用 base64.b32encode 编码，去除填充符'='
    
    Args:
        length: 生成的 Base32 字符串长度，默认 12
        
    Returns:
        指定长度的 Base32 字符串
    """
    # Base32 编码后每 5 字节变成 8 字符，需要计算需要的字节数
    # 12 字符 Base32 需要 8 字节 (8 * 8 / 5 = 12.8，取整后足够)
    num_bytes = (length * 5) // 8 + 1
    random_bytes = secrets.token_bytes(num_bytes)
    base32_string = base64.b32encode(random_bytes).decode('ascii').rstrip('=')
    # 截取指定长度并转为大写
    return base32_string[:length].upper()


def generate_invite_code(session: Session) -> Optional[str]:
    """生成唯一的 12 字符 Base32 邀请码
    
    确保生成的邀请码不与数据库中已有邀请码重复
    最多重试 5 次，仍重复则返回 None
    
    Args:
        session: 数据库会话
        
    Returns:
        生成的邀请码，如果失败返回 None
    """
    max_retries = 5
    
    for _ in range(max_retries):
        code = _generate_base32_code(12)
        
        # 检查是否已存在
        statement = select(InviteCode).where(InviteCode.code == code)
        existing = session.exec(statement).first()
        
        if existing is None:
            return code
    
    # 重试 5 次后仍重复，返回 None
    return None


# =============================================================================
# 邀请码创建
# =============================================================================

def create_invite_code(
    creator_uuid: str,
    creator_role: str,
    invite_type: str = "user",
    expires_days: int = 0,
    max_uses: int = 1,
    note: Optional[str] = None
) -> Dict[str, Any]:
    """创建邀请码
    
    权限规则：
    - admin: 可创建 user 或 trusted 类型，有效期无限制，max_uses 可为 0(无限)
    - trusted: 只能创建 user 类型，有效期最多 30 天，max_uses 最多 10，不能为 0
    
    Args:
        creator_uuid: 创建者 uuid
        creator_role: 创建者角色 ("admin" 或 "trusted")
        invite_type: 邀请码类型 ("user" 或 "trusted")
        expires_days: 有效期天数，0 表示不过期
        max_uses: 最大使用次数，0 表示无限制
        note: 备注信息
        
    Returns:
        dict: {
            "success": bool,
            "code": Optional[str],  # 成功时返回邀请码
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 验证创建者权限
        if creator_role not in ["admin", "trusted"]:
            return {
                "success": False,
                "code": None,
                "error": "无权创建邀请码"
            }
        
        # 验证邀请码类型
        if invite_type not in ["user", "trusted"]:
            return {
                "success": False,
                "code": None,
                "error": "无效的邀请码类型"
            }
        
        # trusted 用户只能创建 user 类型邀请码
        if creator_role == "trusted" and invite_type != "user":
            return {
                "success": False,
                "code": None,
                "error": "trusted 用户只能创建 user 类型邀请码"
            }
        
        # 验证有效期
        if expires_days < 0:
            return {
                "success": False,
                "code": None,
                "error": "有效期不能为负数"
            }
        
        # trusted 用户最多创建 30 天有效期的邀请码，且不能创建无限期邀请码
        if creator_role == "trusted":
            if expires_days == 0:
                return {
                    "success": False,
                    "code": None,
                    "error": "trusted 用户不能创建无限期的邀请码"
                }
            if expires_days > 30:
                return {
                    "success": False,
                    "code": None,
                    "error": "trusted 用户创建的邀请码有效期最多 30 天"
                }
        
        # 验证最大使用次数
        if max_uses < 0:
            return {
                "success": False,
                "code": None,
                "error": "最大使用次数不能为负数"
            }
        
        # trusted 用户不能创建无限次邀请码，且最多 10 次
        if creator_role == "trusted":
            if max_uses == 0:
                return {
                    "success": False,
                    "code": None,
                    "error": "trusted 用户不能创建无限次使用的邀请码"
                }
            if max_uses > 10:
                return {
                    "success": False,
                    "code": None,
                    "error": "trusted 用户创建的邀请码最多使用 10 次"
                }
        
        # 生成邀请码
        code = generate_invite_code(session)
        if code is None:
            return {
                "success": False,
                "code": None,
                "error": "邀请码生成失败，请稍后重试"
            }
        
        # 计算过期时间
        expires_at = None
        if expires_days > 0:
            expires_at = datetime.utcnow() + timedelta(days=expires_days)
        
        # 处理备注（截断至 255 字符）
        if note is not None and len(note) > 255:
            note = note[:255]
        
        # 创建邀请码记录
        invite_code = InviteCode(
            code=code,
            user_id=creator_uuid,
            type=invite_type,
            created_at=datetime.utcnow(),
            used_by="[]",
            used_at="[]",
            uses=0,
            max_uses=max_uses,
            expires_at=expires_at,
            note=note
        )
        
        session.add(invite_code)
        session.commit()
        
        return {
            "success": True,
            "code": code,
            "error": None
        }


# =============================================================================
# API Key 信息获取
# =============================================================================

def get_user_api_key_info(user: User) -> Dict[str, Any]:
    """获取用户 API Key 信息
    
    返回 API Key 的掩码、状态、提供商、base_url、最后修改时间
    
    Args:
        user: User 对象
        
    Returns:
        dict: {
            "success": bool,
            "data": Optional[dict],  # 成功时返回 API Key 信息
            "error": Optional[str]
        }
        data 包含:
            - api_key_masked: 掩码后的 API Key
            - status: API Key 状态 (valid|quota|invalid|pending)
            - provider: 提供商 (bailian|vllm)
            - base_url: API Base URL
            - updated_at: 最后修改时间 (ISO 格式字符串)
    
    特殊处理:
        - admin 用户返回系统级配置信息
    """
    # admin 用户返回系统级配置
    if user.role == "admin":
        return {
            "success": True,
            "data": {
                "api_key_masked": "System",
                "status": "valid",
                "provider": "System",
                "base_url": DASHSCOPE_BASE_URL,
                "updated_at": None
            },
            "error": None
        }
    
    engine = get_engine()
    
    with SessionLocal(engine) as session:
        # 获取用户的 API Key 记录
        api_key_record = get_user_api_key(user.uuid, session=session)
        
        if api_key_record is None:
            return {
                "success": False,
                "data": None,
                "error": "未找到 API Key 记录"
            }
        
        # 获取 User.private 中的 api_key_masked
        user_statement = select(User).where(User.uuid == user.uuid)
        user_data = session.exec(user_statement).first()
        
        api_key_masked = None
        if user_data:
            try:
                private_data = json.loads(user_data.private or "[]")
                if isinstance(private_data, list):
                    for item in private_data:
                        if isinstance(item, dict) and "api_key_masked" in item:
                            api_key_masked = item["api_key_masked"]
                            break
                elif isinstance(private_data, dict):
                    api_key_masked = private_data.get("api_key_masked")
            except (json.JSONDecodeError, TypeError):
                pass
        
        return {
            "success": True,
            "data": {
                "api_key_masked": api_key_masked,
                "status": api_key_record.status,
                "provider": api_key_record.provider,
                "base_url": api_key_record.base_url,
                "updated_at": api_key_record.updated_at.isoformat() if api_key_record.updated_at else None
            },
            "error": None
        }


# =============================================================================
# API Key 更新处理
# =============================================================================

def update_user_api_key_handler(
    user: User,
    action: str,
    api_key_plaintext: Optional[str] = None,
    provider: Optional[str] = None,
    base_url: Optional[str] = None
) -> Dict[str, Any]:
    """处理 API Key 更新/清除请求
    
    1. 检查用户角色，admin 用户直接拒绝
    2. 检查上次更改时间，两次操作间隔必须>15 秒
    3. 根据 action 执行不同逻辑：
       - clear: 直接清除 API Key
       - update: 先 probe 验证，通过后写入
    
    Args:
        user: User 对象
        action: 操作类型 ("update" 或 "clear")
        api_key_plaintext: 明文 API Key（update 操作时必需）
        provider: Key 提供商（update 操作时必需）
        base_url: API Base URL（update 操作时必需）
        
    Returns:
        dict: {
            "success": bool,
            "data": Optional[dict],  # 成功时返回更新后的 API Key 信息
            "error": Optional[str],
            "error_code": Optional[str]  # 错误代码：admin_forbidden, rate_limit, invalid_params, probe_failed, storage_failed, invalid_action
        }
    """
    # admin 用户拒绝修改
    if user.role == "admin":
        return {
            "success": False,
            "data": None,
            "error": "系统设置无法在线修改",
            "error_code": "admin_forbidden"
        }
    
    engine = get_engine()
    
    with SessionLocal(engine) as session:
        # 获取现有的 API Key 记录
        api_key_record = get_user_api_key(user.uuid, session=session)
        
        # 检查操作间隔（15 秒）
        if api_key_record is not None and api_key_record.updated_at:
            current_time = datetime.utcnow()
            time_diff = current_time - api_key_record.updated_at
            
            if time_diff < timedelta(seconds=15):
                remaining = 15 - time_diff.total_seconds()
                return {
                    "success": False,
                    "data": None,
                    "error": f"操作过于频繁，请等待 {remaining:.0f} 秒后再试",
                    "error_code": "rate_limit"
                }
        
        # 根据 action 执行不同逻辑
        if action == "clear":
            # 清除 API Key
            success = update_user_api_key(
                user_uuid=user.uuid,
                api_key_plaintext=None,  # None 触发删除逻辑
                session=session,
                update_user_private=True
            )
            
            if not success:
                return {
                    "success": False,
                    "data": None,
                    "error": "清除 API Key 失败",
                    "error_code": "storage_failed"
                }
            
        elif action == "update":
            # 验证必填参数
            if not api_key_plaintext:
                return {
                    "success": False,
                    "data": None,
                    "error": "更新 API Key 需要提供 api_key 参数",
                    "error_code": "invalid_params"
                }
            if not provider:
                return {
                    "success": False,
                    "data": None,
                    "error": "更新 API Key 需要提供 provider 参数",
                    "error_code": "invalid_params"
                }
            if not base_url:
                return {
                    "success": False,
                    "data": None,
                    "error": "更新 API Key 需要提供 base_url 参数",
                    "error_code": "invalid_params"
                }
            
            # 验证 provider 合法性
            if provider not in ["bailian", "vllm"]:
                return {
                    "success": False,
                    "data": None,
                    "error": "不支持的 Key 提供商，仅支持 'bailian' 或 'vllm'",
                    "error_code": "invalid_params"
                }
            
            # 先 probe 验证 API Key
            probe_result = probe_api_key(base_url, api_key_plaintext, f"API Key update from user: {user.uuid}")
            
            if probe_result == "invalid":
                print(f"API Key probe failed during update, user_uuid: {user.uuid}, base_url: {base_url}, time: {datetime.utcnow()}")
                return {
                    "success": False,
                    "data": None,
                    "error": "API Key 无效或无法连接",
                    "error_code": "probe_failed"
                }
            
            if probe_result == "quota":
                return {
                    "success": False,
                    "data": None,
                    "error": "API Key 配额不足",
                    "error_code": "quota_exceeded"
                }
            
            # probe 通过，执行更新
            success = update_user_api_key(
                user_uuid=user.uuid,
                api_key_plaintext=api_key_plaintext,
                provider=provider,
                base_url=base_url,
                status="valid",
                session=session,
                update_user_private=True
            )
            
            if not success:
                return {
                    "success": False,
                    "data": None,
                    "error": "API Key 存储失败",
                    "error_code": "storage_failed"
                }
            
        else:
            return {
                "success": False,
                "data": None,
                "error": f"不支持的操作类型：{action}",
                "error_code": "invalid_action"
            }
        
        # 返回更新后的信息
        session.commit()
        
        # 重新获取更新后的信息
        result = get_user_api_key_info(user)
        
        return {
            "success": True,
            "data": result.get("data"),
            "error": None
        }


# =============================================================================
# 邀请码列表
# =============================================================================

def get_invite_codes(user_uuid: str, user_role: str) -> Dict[str, Any]:
    """获取邀请码列表
    
    admin 用户返回所有邀请码
    其他用户只返回自己创建的邀请码
    
    Args:
        user_uuid: 请求者 uuid
        user_role: 请求者角色
        
    Returns:
        dict: {
            "success": bool,
            "codes": List[dict],  # 邀请码列表
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 根据角色构建查询
        if user_role == "admin":
            statement = select(InviteCode).order_by(sa_desc(InviteCode.created_at))  # type: ignore[arg-type]
        else:
            statement = select(InviteCode).where(
                InviteCode.user_id == user_uuid
            ).order_by(sa_desc(InviteCode.created_at))  # type: ignore[arg-type]
        
        invite_codes = session.exec(statement).all()
        
        # 转换为字典列表
        codes = []
        for ic in invite_codes:
            # 解析 JSON 字段
            try:
                used_by = json.loads(ic.used_by) if ic.used_by else []
            except (json.JSONDecodeError, TypeError):
                used_by = []
            
            try:
                used_at = json.loads(ic.used_at) if ic.used_at else []
            except (json.JSONDecodeError, TypeError):
                used_at = []
            
            codes.append({
                "code": ic.code,
                "user_id": ic.user_id,
                "type": ic.type,
                "created_at": ic.created_at.isoformat(),
                "used_by": used_by,
                "used_at": used_at,
                "uses": ic.uses,
                "max_uses": ic.max_uses,
                "expires_at": ic.expires_at.isoformat() if ic.expires_at else None,
                "note": ic.note
            })
        
        return {
            "success": True,
            "codes": codes,
            "error": None
        }


# =============================================================================
# 邀请码验证
# =============================================================================

def verify_invite_code(code: str) -> Dict[str, Any]:
    """验证邀请码
    
    检查邀请码是否存在、是否过期、是否达到使用次数限制
    
    Args:
        code: 邀请码
        
    Returns:
        dict: {
            "exists": bool,  # 是否存在
            "valid": bool,   # 是否有效（未过期且未达使用限制）
            "type": Optional[str],  # 邀请码类型
            "creator_uuid": Optional[str],  # 创建者 uuid
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(InviteCode).where(InviteCode.code == code)
        invite_code = session.exec(statement).first()
        
        if invite_code is None:
            return {
                "exists": False,
                "valid": False,
                "type": None,
                "creator_uuid": None,
                "error": "Invite code invalid"
            }
        
        # 检查是否过期
        current_time = datetime.utcnow()
        if invite_code.expires_at and invite_code.expires_at < current_time:
            return {
                "exists": True,
                "valid": False,
                "type": invite_code.type,
                "creator_uuid": invite_code.user_id,
                "error": "Invite code has expired"
            }
        
        # 检查是否达到使用次数限制
        if invite_code.max_uses > 0 and invite_code.uses >= invite_code.max_uses:
            return {
                "exists": True,
                "valid": False,
                "type": invite_code.type,
                "creator_uuid": invite_code.user_id,
                "error": "Invite code has reached maximum usage limit"
            }
        
        return {
            "exists": True,
            "valid": True,
            "type": invite_code.type,
            "creator_uuid": invite_code.user_id,
            "error": None
        }


def use_invite_code(
    code: str,
    user_email: str,
    session: Optional[Session] = None
) -> Dict[str, Any]:
    """使用邀请码（用于用户注册时）
    
    Args:
        code: 邀请码
        user_email: 使用邀请码的用户邮箱
        session: 可选的外部 session。如果提供则使用外部 session（不 commit/rollback），
                否则创建自己的 session 并管理事务
        
    Returns:
        dict: {
            "success": bool,
            "error": Optional[str]
        }
    """
    # 决定使用哪个 session
    own_session = False
    if session is None:
        engine = get_engine()
        session = Session(engine)
        own_session = True
    
    try:
        statement = select(InviteCode).where(InviteCode.code == code)
        invite_code = session.exec(statement).first()
        
        if invite_code is None:
            if own_session:
                session.close()
            return {
                "success": False,
                "error": "邀请码不存在"
            }
        
        # 检查是否过期
        current_time = datetime.utcnow()
        if invite_code.expires_at and invite_code.expires_at < current_time:
            if own_session:
                session.close()
            return {
                "success": False,
                "error": "邀请码已过期"
            }
        
        # 检查是否达到使用次数限制
        if invite_code.max_uses > 0 and invite_code.uses >= invite_code.max_uses:
            if own_session:
                session.close()
            return {
                "success": False,
                "error": "邀请码已达到最大使用次数"
            }
        
        # 更新使用记录
        try:
            used_by = json.loads(invite_code.used_by) if invite_code.used_by else []
        except (json.JSONDecodeError, TypeError):
            used_by = []
        
        try:
            used_at = json.loads(invite_code.used_at) if invite_code.used_at else []
        except (json.JSONDecodeError, TypeError):
            used_at = []
        
        used_by.append(user_email)
        used_at.append(current_time.isoformat())
        
        invite_code.used_by = json.dumps(used_by, ensure_ascii=False)
        invite_code.used_at = json.dumps(used_at, ensure_ascii=False)
        invite_code.uses += 1
        
        session.add(invite_code)
        
        # 只在有自己的 session 时才 commit
        if own_session:
            session.commit()
            session.close()
        
        return {
            "success": True,
            "error": None
        }
        
    except Exception as e:
        # 只在有自己的 session 时才 rollback
        if own_session:
            session.rollback()
            session.close()
        return {
            "success": False,
            "error": str(e)
        }


# =============================================================================
# 邀请码删除
# =============================================================================

def delete_invite_code(code: str, user_uuid: str, user_role: str) -> Dict[str, Any]:
    """删除邀请码
    
    admin 可删除任何人创建的邀请码
    其他用户只能删除自己创建的邀请码
    
    生产环境应启用使用次数检查，防止审计链断裂
    
    Args:
        code: 邀请码
        user_uuid: 请求者 uuid
        user_role: 请求者角色
        
    Returns:
        dict: {
            "success": bool,
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(InviteCode).where(InviteCode.code == code)
        invite_code = session.exec(statement).first()
        
        if invite_code is None:
            return {
                "success": False,
                "error": "邀请码不存在"
            }
        
        # 权限检查：admin 可删除任何，其他人只能删除自己的
        if user_role != "admin" and invite_code.user_id != user_uuid:
            return {
                "success": False,
                "error": "无权删除该邀请码"
            }
        
        # =========================================================================
        # 生产环境应启用以下判断逻辑，防止审计链断裂
        # 如果邀请码已使用，禁止删除
        # =========================================================================
        # if invite_code.uses > 0:
        #     return {
        #         "success": False,
        #         "error": "该邀请码已被使用，必须保持审计链完整，无法删除"
        #     }
        # =========================================================================
        
        # 执行删除
        session.delete(invite_code)
        session.commit()
        
        return {
            "success": True,
            "error": None
        }


# =============================================================================
# 用户注册
# =============================================================================

def register_user(
    invite_code: str,
    email: str,
    username: str,
    password: str,
    api_key: str,
    key_provider: str,
    base_url: str
) -> Dict[str, Any]:
    """用户注册（BYOK 模式）
    
    注册流程：
    1. 检查注册功能是否开启
    2. 验证邮箱格式（使用 email-validator）
    3. 邮箱转小写，检查长度不超过 254 字符
    4. 密码截断至 120 字符
    5. 验证邀请码有效性
    6. 验证 key_provider 为 "bailian" 或 "vllm"
    7. probe 检查 API Key
    8. 如果 valid：
       - 使用邀请码创建用户
       - 设置用户 private 字段（invited_by, username_changed_at, api_key_masked）
       - 加密并存储 API Key
       - 设置 status 为 valid
    
    Args:
        invite_code: 邀请码
        email: 用户邮箱
        username: 用户名
        password: 密码
        api_key: 用户提供的 API Key
        key_provider: Key 提供商 ("bailian" 或 "vllm")
        base_url: API Base URL
        
    Returns:
        dict: {
            "success": bool,
            "user": Optional[dict],  # 成功时返回用户信息
            "error": Optional[str]
        }
    """
    # =========================================================================
    # 步骤 1: 检查注册功能是否开启
    # =========================================================================
    if not REGISTRATION_ENABLED:
        return {
            "success": False,
            "user": None,
            "error": "注册功能当前未开启"
        }
    
    # =========================================================================
    # 步骤 2: 验证邮箱格式（使用 email-validator）
    # 只验证语法，不检查 DNS 可投递性
    # =========================================================================
    try:
        valid = validate_email(email, check_deliverability=False)
        email = valid.email  # 标准化后的邮箱（已转小写）
    except EmailNotValidError as e:
        return {
            "success": False,
            "user": None,
            "error": f"无效的邮箱格式：{str(e)}"
        }
    
    # =========================================================================
    # 步骤 3: 邮箱转小写，检查长度不超过 254 字符（RFC 5321 限制）
    # =========================================================================
    email = email.lower().strip()
    if len(email) > 254:
        return {
            "success": False,
            "user": None,
            "error": "邮箱地址超过最大长度限制（254 字符）"
        }
    
    # =========================================================================
    # 步骤 4: 用户名截断至16字符，密码截断至 120 字符
    # =========================================================================
    username = username[:16]
    password = password[:120]
    
    # =========================================================================
    # 步骤 5: 验证邀请码
    # =========================================================================
    invite_result = verify_invite_code(invite_code)
    if not invite_result["exists"]:
        return {
            "success": False,
            "user": None,
            "error": "邀请码无效"
        }
    if not invite_result["valid"]:
        return {
            "success": False,
            "user": None,
            "error": invite_result.get("error", "邀请码无效")
        }
    
    # =========================================================================
    # 步骤 6: 验证 key_provider
    # =========================================================================
    if key_provider not in ["bailian", "vllm"]:
        return {
            "success": False,
            "user": None,
            "error": "不支持的 Key 提供商"
        }
    
    # =========================================================================
    # 步骤 7: probe 检查 API Key
    # =========================================================================
    probe_result = probe_api_key(base_url, api_key, f"Registration from email: {email}")  # 注意记录请求来源
    
    if probe_result == "invalid":
        print(f"API Key probe failed during registration, email: {email}, base_url: {base_url}, time: {datetime.utcnow()}")  # 记录失败的 probe 请求
        return {
            "success": False,
            "user": None,
            "error": "API Key 无效或无法连接"
        }
    
    if probe_result == "quota":
        return {
            "success": False,
            "user": None,
            "error": "API Key 配额不足"
        }
    
    # probe_result == "valid"，继续注册流程
    
    # =========================================================================
    # 步骤 8: 创建用户并存储 API Key
    # =========================================================================
    engine = get_engine()
    
    with Session(engine) as session:
        # 检查邮箱是否已被注册
        statement = select(User).where(User.email == email)
        existing_user = session.exec(statement).first()
        
        if existing_user is not None:
            return {
                "success": False,
                "user": None,
                "error": "该邮箱已被注册"
            }
        
        # 生成用户 UUID
        user_uuid = str(uuid.uuid4())
        current_time = datetime.utcnow()
        
        # 根据邀请码类型确定用户角色
        invite_type = invite_result["type"]
        user_role = invite_type if invite_type in ["user", "trusted"] else "user"
        
        # 获取邀请码创建者的邮箱（用于记录 invited_by）
        creator_uuid = invite_result["creator_uuid"]
        creator_statement = select(User).where(User.uuid == creator_uuid)
        creator_user = session.exec(creator_statement).first()
        invited_by_email = creator_user.email if creator_user else "unknown"
        
        # 使用 auth.py 中的 hash_password 函数对密码进行哈希
        password_hash = hash_password(password)
        
        # 创建用户
        user = User(
            uuid=user_uuid,
            email=email,
            username=username,
            password_hash=password_hash,
            role=user_role,
            created_at=current_time,
            private="[]",  # 稍后更新
            password_changed_at=None
        )
        session.add(user)
        session.flush()  # 获取自增的 uid
        
        # 构建 private 字段，存储邀请者邮箱、用户名修改时间
        # api_key_masked 将由 update_user_api_key 函数处理
        private_data = {
            "invited_by": invited_by_email,
            "username_changed_at": current_time.isoformat()
        }
        user.private = json.dumps(private_data, ensure_ascii=False)
        
        # 使用 apikeytool 提供的统一函数加密并存储 API Key
        # 同时更新 User.private 中的 api_key_masked
        try:
            success = update_user_api_key(
                user_uuid=user_uuid,
                api_key_plaintext=api_key,
                provider=key_provider,
                base_url=base_url,
                status="valid",
                session=session,
                update_user_private=True
            )
            if not success:
                session.rollback()
                return {
                    "success": False,
                    "user": None,
                    "error": "API Key 存储失败"
                }
        except Exception as e:
            session.rollback()
            return {
                "success": False,
                "user": None,
                "error": f"API Key 处理失败：{str(e)}"
            }
        
        # 使用邀请码（传入当前 session，保持原子性）
        use_result = use_invite_code(invite_code, email, session=session)
        if not use_result["success"]:
            session.rollback()
            return {
                "success": False,
                "user": None,
                "error": f"邀请码使用失败：{use_result.get('error', '未知错误')}"
            }
        
        # 提交所有更改
        session.commit()
        
        return {
            "success": True,
            "user": {
                "uid": user.uid,
                "uuid": user.uuid,
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "created_at": user.created_at.isoformat()
            },
            "error": None
        }
