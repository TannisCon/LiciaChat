'''
用户认证和授权模块
'''
import os
import uuid
import json
import unicodedata
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import jwt
import bcrypt
from sqlmodel import SQLModel, Field, Session, select
from sqlalchemy import desc

from appinit import (
    config,
    get_engine,
    SessionLocal,
    DB_PATH,
    User,
    JWT_SECRET,
    JWT_ALGORITHM,
    JWT_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    ADMIN_EMAIL,
)

# 注意所有后端处理和存储的时间都使用 UTC 时间，前端展示时转换为用户本地时间

# 规范化密码输入，防止 Unicode 字符导致的哈希不一致问题
def _normalize(password: str) -> str:
    """归一化密码输入，使用 Unicode NFKC 规范化"""
    return unicodedata.normalize("NFKC", password)

def hash_password(password: str) -> str:
    """对密码进行哈希处理"""
    password = _normalize(password)
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """验证密码"""
    password = _normalize(password)
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


# 注意：init_database 已迁移到 appinit.py，此处保留函数签名以保持向后兼容
# 实际使用时应直接调用 appinit.init_database()
# def init_database():
#     """初始化数据库（已废弃，请使用 appinit.init_database）"""
#     from appinit import init_database as _init
#     _init()

# 已转移，功能在account.py中，保持auth.py专注于认证和授权逻辑
# def create_user()
#         return user


def authenticate_user(email: str, password: str) -> Optional[User]:
    """验证用户登录"""
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(User).where(User.email == email)
        user = session.exec(statement).first()
        
        if user is None:
            return None
        
        if not verify_password(password, user.password_hash):
            return None
        
        return user


def create_token(email: str) -> str:
    """创建 JWT access token"""
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MINUTES)
    
    payload = {
        "email": email,
        "type": "access",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    
    token = jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    return token


def create_refresh_token(email: str) -> str:
    """创建 JWT refresh token
    
    使用 appinit 中配置的 refresh_token_expire_days，默认为 30 天
    """
    expire_days = REFRESH_TOKEN_EXPIRE_DAYS
    expire = datetime.utcnow() + timedelta(days=expire_days)
    
    payload = {
        "email": email,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow()
    }
    
    token = jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    return token


def verify_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    """验证 JWT refresh token
    
    验证内容包括：
    1. 验签 token
    2. 检查过期时间
    3. 检查 type == "refresh"
    4. 检查 token.iat >= password_changed_at（确保密码修改后旧 token 失效）
    
    返回 payload，如果无效返回 None
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )
        
        # 检查 type 是否为 "refresh"
        if payload.get("type") != "refresh":
            print(f"Token type 不正确：{payload.get('type')}")
            return None
        
        # 获取用户信息，检查 password_changed_at
        email = payload.get("email")
        if email:
            user = get_user_by_email(email)
            if user and user.password_changed_at:
                # 如果 token 签发时间早于密码修改时间，则 token 无效
                token_iat = payload.get("iat")
                if token_iat and isinstance(token_iat, (int, float)):
                    iat_datetime = datetime.utcfromtimestamp(token_iat)
                    if iat_datetime < user.password_changed_at:
                        # print("Refresh token 签发时间早于密码修改时间，token 已失效")
                        return None
        return payload
    except jwt.ExpiredSignatureError:
        # print("Refresh token 已过期")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Refresh token 无效：{e}")
        return None


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """验证 JWT access token
    
    验证内容包括：
    1. 验签 token
    2. 检查过期时间
    3. 检查 token.iat >= password_changed_at（确保密码修改后旧 token 失效）
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )
        
        # 获取用户信息，检查 password_changed_at
        email = payload.get("email")
        if email:
            user = get_user_by_email(email)
            if user and user.password_changed_at:
                # 如果 token 签发时间早于密码修改时间，则 token 无效
                token_iat = payload.get("iat")
                if token_iat and isinstance(token_iat, (int, float)):
                    iat_datetime = datetime.utcfromtimestamp(token_iat)
                    if iat_datetime < user.password_changed_at:
                        # print("Token 签发时间早于密码修改时间，token 已失效")
                        return None
        
        return payload
    except jwt.ExpiredSignatureError:
        # print("Access token 已过期")
        return None
    except jwt.InvalidTokenError:
        return None


def get_user_by_email(email: str) -> Optional[User]:
    """通过邮箱获取用户信息"""
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(User).where(User.email == email)
        user = session.exec(statement).first()
        return user


def get_user_by_token(token: str) -> Optional[User]:
    """通过 token 获取用户信息"""
    payload = verify_token(token)
    if payload is None:
        return None
    
    email = payload.get("email")
    if email is None:
        return None
    
    return get_user_by_email(email)


def update_username(email: str, new_username: str) -> dict:
    """更新用户名
    
    检查 private 字段中的 username_changed_at 记录：
    - 如无该数据、数据为空、数据值不是合法 UTC 时间，或上次修改超过 1 天，则允许修改
    - 若上次修改距离本次修改不超过 1 天，则拒绝修改
    - 若上次修改记录的时间是未来时间，也拒绝修改
    - 如果用户是 admin，不记录 username_changed_at
    
    Args:
        email: 用户邮箱
        new_username: 新用户名
        
    Returns:
        dict: {
            "success": bool,
            "user": Optional[dict],  # 成功时返回用户信息
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 复用 get_user_by_email 函数获取用户
        user = get_user_by_email(email)
        
        if user is None:
            return {
                "success": False,
                "user": None,
                "error": "用户不存在"
            }
        
        # 检查新用户名是否为空
        if not new_username or not new_username.strip():
            return {
                "success": False,
                "user": None,
                "error": "用户名不能为空"
            }
        
        # 解析 private 字段
        private_str = user.private
        if private_str is None or private_str.strip() == "":
            private_str = "[]"
        
        try:
            private_data = json.loads(private_str)
        except (json.JSONDecodeError, TypeError):
            private_data = []
        
        # 查找 username_changed_at 记录
        username_changed_at = None
        if isinstance(private_data, list):
            for item in private_data:
                if isinstance(item, dict) and "username_changed_at" in item:
                    username_changed_at = item["username_changed_at"]
                    break
        elif isinstance(private_data, dict):
            username_changed_at = private_data.get("username_changed_at")
        
        current_time = datetime.utcnow()
        
        # 如果存在 username_changed_at 记录且用户不是 admin
        if username_changed_at is not None and user.role != "admin":
            try:
                # 尝试解析 UTC 时间
                last_change_time: Optional[datetime] = None
                if isinstance(username_changed_at, str):
                    # 处理 ISO 格式字符串
                    try:
                        last_change_time = datetime.fromisoformat(username_changed_at.replace('Z', '+00:00'))
                        # 如果是带时区的时间，转换为 UTC
                        if last_change_time.tzinfo is not None:
                            offset = last_change_time.utcoffset()
                            if offset is not None:
                                last_change_time = last_change_time.replace(tzinfo=None) - offset
                    except ValueError:
                        # 解析失败
                        last_change_time = None
                elif isinstance(username_changed_at, (int, float)):
                    # 处理时间戳
                    try:
                        last_change_time = datetime.utcfromtimestamp(username_changed_at)
                    except (ValueError, OSError):
                        last_change_time = None
                
                if last_change_time is None:
                    # 无法解析的格式，视为无效
                    return {
                        "success": False,
                        "user": None,
                        "error": "上次修改时间格式无效"
                    }
                
                # 检查是否是未来时间
                if last_change_time > current_time:
                    return {
                        "success": False,
                        "user": None,
                        "error": "上次修改时间记录异常"
                    }
                
                # 检查是否超过 1 天
                time_diff = current_time - last_change_time
                if time_diff < timedelta(days=1):
                    return {
                        "success": False,
                        "user": None,
                        "error": "距离上次修改用户名不足 24 小时，请稍后再试"
                    }
                
            except Exception as e:
                # 解析失败，视为无效时间
                return {
                    "success": False,
                    "user": None,
                    "error": f"上次修改时间格式无效：{str(e)}"
                }
        
        # 更新用户名 - 截断为 16 个字符
        user.username = new_username.strip()[:16]
        
        # 如果不是 admin，更新 private 字段
        if user.role != "admin":
            # 统一使用字典格式，保留所有其他字段
            if isinstance(private_data, dict):
                # 字典格式：直接更新 username_changed_at，保留所有其他字段
                private_data["username_changed_at"] = current_time.isoformat()
                user.private = json.dumps(private_data, ensure_ascii=False)
            elif isinstance(private_data, list):
                # 兼容旧的列表格式，转换为字典格式
                new_private_data = {"username_changed_at": current_time.isoformat()}
                # 保留列表中的其他字段
                for item in private_data:
                    if isinstance(item, dict):
                        for key, value in item.items():
                            if key != "username_changed_at":
                                new_private_data[key] = value
                user.private = json.dumps(new_private_data, ensure_ascii=False)
            else:
                # 其他格式，初始化为字典
                user.private = json.dumps({"username_changed_at": current_time.isoformat()}, ensure_ascii=False)
        
        session.add(user)
        session.commit()
        session.refresh(user)
        
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


def validate_password_length(password: str, min_length: int = 8) -> bool:
    """验证密码长度
    
    Args:
        password: 待验证的密码
        min_length: 最小长度要求，默认 8
        
    Returns:
        bool: 密码长度是否符合要求
    """
    return len(password) >= min_length


def update_password(email: str, old_password: str, new_password: str) -> dict:
    """更新用户密码
    
    验证旧密码正确后，更新为新密码
    新密码长度必须大于 8
    更新成功后设置 password_changed_at 为当前 UTC 时间减 1 秒
    
    Args:
        email: 用户邮箱
        old_password: 旧密码
        new_password: 新密码
        
    Returns:
        dict: {
            "success": bool,
            "user": Optional[dict],  # 成功时返回用户信息
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 获取用户
        user = get_user_by_email(email)
        
        if user is None:
            return {
                "success": False,
                "user": None,
                "error": "用户不存在"
            }
        
        # 验证旧密码 - 复用现有 verify_password 函数
        if not verify_password(old_password, user.password_hash):
            return {
                "success": False,
                "user": None,
                "error": "原密码错误"
            }
        
        # 验证新密码长度 - 复用现有 validate_password_length 函数
        if not validate_password_length(new_password):
            return {
                "success": False,
                "user": None,
                "error": "新密码长度必须大于 8 位"
            }
        
        # 更新密码 - 截断为 120 位
        user.password_hash = hash_password(new_password[:120])
        
        # 设置 password_changed_at 为当前 UTC 时间减 1 秒
        current_time = datetime.utcnow()
        password_changed_at = current_time - timedelta(seconds=1)
        user.password_changed_at = password_changed_at
        
        session.add(user)
        session.commit()
        session.refresh(user)
        
        return {
            "success": True,
            "user": {
                "uid": user.uid,
                "uuid": user.uuid,
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "created_at": user.created_at.isoformat(),
                "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None
            },
            "error": None
        }
