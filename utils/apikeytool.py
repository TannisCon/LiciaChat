"""
API Key 工具模块

包含：
1. API Key 的 probe 检查逻辑
2. API Key 存储工具函数
"""
import time
import json
from datetime import datetime
from typing import Optional, Any

from openai import OpenAI

from appinit import (
    get_engine,
    SessionLocal,
    ApiKey,
    User,
    LITE_LLM_MODEL,
)
from sqlmodel import select
from typing import Optional, Union
from utils.crypto import encrypt_api_key


# =============================================================================
# API Key Probe 探针 
# - 注意，危险操作! 需要日志记录请求来源，不得将API key明文记录
# - 不得将该功能暴露在外部接口，必须在受控环境下使用
# - 探针将消耗 API Key 的调用额度!
# =============================================================================

def probe_api_key(base_url: str, api_key: str, source: str) -> str:
    """对 API Key 进行两步 probe 检查
    探针操作将消耗 API Key 的调用额度，谨慎使用！
    调用时必须提供请求来源（source），以便日志记录和安全审计，**但不得记录 API Key 明文**。

    探针步骤
    第一步：获取模型列表
        - 带着 API Key 连接 base_url 的 models 端点
        - 超时 5 秒
        - 获取 200 响应后继续
    
    第二步：测试对话
        - 延迟 1 秒
        - 对 LITE_LLM_MODEL 发起对话请求
        - sys prompt 为空，user prompt 为 "hi"，max_token 为 1
        - 超时 5 秒
    
    返回值：
        - "valid": 两步检查都通过
        - "quota": 任何请求返回 429 且错误信息包含 "billing" 或 "plan"
        - "invalid": 其他任何错误、超时或异常
    
    Args:
        base_url: API 基础 URL
        api_key: 要检查的 API Key
        source: 请求来源，字符串

    Returns:
        str: "valid"、"quota" 或 "invalid"
    """
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=5.0  # 5 秒超时
    )

    # 检查请求来源是否包含API Key的特征（如 "sk-"），如果包含则抛出异常，**以防止误用探针导致 API Key 明文泄露在日志中**
    if source.find("sk-") != -1 or source.find("key-") != -1:
        raise ValueError("API Key探针参数错误，请求来源(source)字符串不得包含 API Key 明文特征")
    
    print(f"Probing API Key from source: {source}, base_url: {base_url}, time: {datetime.utcnow()}")  # 记录请求来源和 base_url，**不记录 api_key 明文**
    # =========================================================================
    # 第一步：尝试带Key获取模型列表
    # =========================================================================
    try:
        models = client.models.list()
        # 获取 200 响应后，忽略响应体，继续下一步
    except Exception as e:
        # 检查是否为 quota 错误
        error_status, is_quota_error = _check_quota_error(e)
        if error_status is not None:
            if is_quota_error:
                return "quota"
        return "invalid"
    
    # =========================================================================
    # 延迟 1 秒后进行第二步
    # =========================================================================
    time.sleep(1.0)
    
    # =========================================================================
    # 第二步：测试模型可用性
    # =========================================================================
    try:
        response = client.chat.completions.create(
            model=LITE_LLM_MODEL,
            messages=[
                {"role": "system", "content": ""},  # 空 sys prompt
                {"role": "user", "content": "hi"}   # user prompt 为 "hi"
            ],
            max_tokens=1,
            temperature=0.1,
            extra_body={
                "enable_thinking": False
            }
        )
        # 成功响应，返回 valid
        return "valid"
    except Exception as e:
        # 检查是否为 quota 错误
        error_status, is_quota_error = _check_quota_error(e)
        if error_status is not None:
            if is_quota_error:
                return "quota"
        return "invalid"


def _check_quota_error(exception: Exception) -> tuple[Optional[int], bool]:
    """检查异常是否为 quota 相关错误
    
    Args:
        exception: 捕获的异常
        
    Returns:
        tuple: (status_code, is_quota_error)
            - status_code: HTTP 状态码，如果不是 HTTP 错误返回 None
            - is_quota_error: 是否为 quota 错误（429 且包含 billing 或 plan）
    """
    # 尝试从异常中获取状态码和错误信息
    status_code = None
    error_message = ""
    
    # OpenAI SDK 的 APIError 有 status_code 和 body 属性
    if hasattr(exception, 'status_code'):
        status_code = exception.status_code  # type: ignore
    
    # 尝试获取错误信息
    if hasattr(exception, 'body') and isinstance(exception.body, dict):  # type: ignore
        error_info = exception.body.get('error', {})  # type: ignore
        if isinstance(error_info, dict):
            error_message = str(error_info.get('message', ''))
            # 也检查 error 类型
            error_type = str(error_info.get('type', ''))
            error_message += " " + error_type
    elif hasattr(exception, 'message'):
        error_message = str(exception.message)  # type: ignore
    else:
        error_message = str(exception)
    
    # 检查是否为 429 且包含 billing 或 plan
    if status_code == 429:
        error_message_lower = error_message.lower()
        if 'billing' in error_message_lower or 'plan' in error_message_lower:
            return status_code, True
    
    return status_code, False


# =============================================================================
# API Key 存储工具
# =============================================================================

def _mask_api_key(api_key: str) -> str:
    """对 API Key 进行掩码处理，保留前 8 位和后 4 位
    
    Args:
        api_key: 明文 API Key
        
    Returns:
        str: 掩码后的 API Key，例如 "sk-1234************cdef"
    """
    if len(api_key) <= 12:
        # 如果 key 太短，全部用星号
        return '*' * len(api_key)
    
    # 保留前 8 位和后 4 位，中间用星号替换
    masked = api_key[:8] + '*' * (len(api_key) - 12) + api_key[-4:]
    return masked


def update_user_api_key(
    user_uuid: str,
    api_key_plaintext: Optional[str] = None,
    provider: Optional[str] = None,
    base_url: Optional[str] = None,
    status: Optional[str] = None,
    session: Optional[SessionLocal] = None,
    update_user_private: bool = True
) -> bool:
    """更新或创建用户的 API Key 记录
    
    根据传入的参数更新 apiKeys 表中对应用户的记录。
    如果提供 api_key_plaintext，会自动加密并存储。
    如果 api_key_plaintext 为 None，会清空 API Key 相关数据（删除操作）。
    如果 update_user_private=True（默认），会同时更新/清空 User.private 中的 api_key_masked。
    
    Args:
        user_uuid: 用户 UUID（必须）
        api_key_plaintext: 明文 API Key（可选）
            - 如果提供：加密并存储
            - 如果为 None：清空 API Key 相关数据（删除操作）
        provider: Key 对应提供商，默认 "bailian"（可选）
        base_url: Key 对应 base_url（可选）
        status: Key 状态 "pending"|"valid"|"quota"|"invalid"（可选）
        session: 可选的外部 session。如果提供则使用外部 session（不 commit/rollback），
                否则创建自己的 session 并管理事务
        update_user_private: 是否同时更新 User.private 中的 api_key_masked（默认 True）
        
    Returns:
        bool: 操作是否成功
    """
    # 决定使用哪个 session
    own_session = False
    if session is None:
        engine = get_engine()
        session = SessionLocal(engine)
        own_session = True
    
    try:
        # 如果提供明文 API Key，进行加密；如果为 None 或空字符串，准备清空数据（删除操作）
        encrypted_key = b''
        iv = b''
        tag = b''
        
        if api_key_plaintext:  # None 或 '' 都会被视为 False，触发删除逻辑
            encrypted_key, iv, tag = encrypt_api_key(api_key_plaintext)
        
        # 尝试获取现有记录
        statement = select(ApiKey).where(ApiKey.user_id == user_uuid)
        api_key_record = session.exec(statement).first()
        
        if api_key_record is None:
            # 创建新记录
            api_key_record = ApiKey(
                user_id=user_uuid,
                provider=provider if provider is not None else "bailian",
                base_url=base_url if base_url is not None else "",
                encrypted_key=encrypted_key,
                iv=iv,
                tag=tag,
                updated_at=datetime.utcnow(),
                status=status if status is not None else "pending"
            )
            session.add(api_key_record)
        else:
            # 更新现有记录
            if provider is not None:
                api_key_record.provider = provider
            elif not api_key_plaintext:
                # 删除操作：重置 provider 为默认值
                api_key_record.provider = "bailian"
                
            if base_url is not None:
                api_key_record.base_url = base_url
            elif not api_key_plaintext:
                # 删除操作：清空 base_url
                api_key_record.base_url = ""
                
            if api_key_plaintext:
                # 存储新 key
                api_key_record.encrypted_key = encrypted_key
                api_key_record.iv = iv
                api_key_record.tag = tag
            else:
                # 删除操作：清空加密数据
                api_key_record.encrypted_key = b''
                api_key_record.iv = b''
                api_key_record.tag = b''
                
            if status is not None:
                api_key_record.status = status
            elif not api_key_plaintext:
                # 删除操作：状态置为 pending
                api_key_record.status = "pending"
                
            # if api_key_plaintext:
            api_key_record.updated_at = datetime.utcnow()
        
        # 更新 User.private 中的 api_key_masked
        if update_user_private:
            user_statement = select(User).where(User.uuid == user_uuid)
            user = session.exec(user_statement).first()
            if user:
                # 解析现有 private 字段
                try:
                    private_data = json.loads(user.private or "[]")
                    if isinstance(private_data, list):
                        # 如果是列表格式，转换为字典
                        private_dict = {}
                        for item in private_data:
                            if isinstance(item, dict):
                                private_dict.update(item)
                        private_data = private_dict
                except (json.JSONDecodeError, TypeError):
                    private_data = {}
                
                if api_key_plaintext:
                    # 更新 api_key_masked
                    private_data["api_key_masked"] = _mask_api_key(api_key_plaintext)
                else:
                    # 删除操作：清空 api_key_masked
                    private_data.pop("api_key_masked", None)
                
                user.private = json.dumps(private_data, ensure_ascii=False)
                session.add(user)
        
        # 只在有自己的 session 时才 commit
        if own_session:
            session.commit()
        
        return True
        
    except Exception as e:
        # 只在有自己的 session 时才 rollback
        if own_session:
            session.rollback()
        print(f"更新 API Key 记录失败：{e}")
        return False
    finally:
        # 只在有自己的 session 时才 close
        if own_session:
            session.close()


# =============================================================================
# API Key 获取工具
# =============================================================================

def _get_user_uuid_from_identifier(identifier: Union[str, User], session: SessionLocal) -> Optional[str]:
    """内部函数：根据用户标识符获取用户 uuid
    
    Args:
        identifier: 用户标识符，可以是 uuid 字符串、email 字符串或 User 对象
        session: 数据库会话
        
    Returns:
        用户 uuid，如果找不到返回 None
    """
    if isinstance(identifier, User):
        return identifier.uuid
    
    if isinstance(identifier, str):
        # 先尝试作为 uuid 查询
        statement = select(User).where(User.uuid == identifier)
        user = session.exec(statement).first()
        
        if user is None:
            # 作为 uuid 没找到，尝试作为 email 查询
            statement = select(User).where(User.email == identifier)
            user = session.exec(statement).first()
        
        if user is None:
            return None
        
        return user.uuid
    
    return None


def get_user_api_key(
    user_identifier: Union[str, User],
    session: Optional[SessionLocal] = None
) -> Optional[ApiKey]:
    """根据用户 uuid 或 email 获取用户的 API Key 记录
    
    Args:
        user_identifier: 用户标识符，可以是 uuid 字符串、email 字符串或 User 对象
        session: 可选的外部 session。如果提供则使用外部 session，
                否则使用上下文管理器创建并管理 session
        
    Returns:
        Optional[ApiKey]: ApiKey 记录对象，如果不存在返回 None
        
    注意：
        - 该函数只负责获取记录，不进行状态检查
        - 调用方需自行检查 record.status 判断 key 是否有效
        - 用户不存在时也返回 None
    """
    # 如果提供了外部 session，直接使用
    if session is not None:
        user_uuid = _get_user_uuid_from_identifier(user_identifier, session)
        if user_uuid is None:
            return None
        
        statement = select(ApiKey).where(ApiKey.user_id == user_uuid)
        return session.exec(statement).first()
    
    # 使用上下文管理器创建 session
    with SessionLocal(get_engine()) as session:
        user_uuid = _get_user_uuid_from_identifier(user_identifier, session)
        if user_uuid is None:
            return None
        
        statement = select(ApiKey).where(ApiKey.user_id == user_uuid)
        return session.exec(statement).first()


def decrypt_api_key_record(api_key_record: ApiKey) -> str:
    """解密用户的 API Key 记录
    
    注意：此函数返回明文 API Key，仅用于在内存中临时使用
    严禁将明文 API Key 记录到日志或持久化存储
    
    Args:
        api_key_record: ApiKey 记录对象
        
    Returns:
        str: 解密后的明文 API Key
        
    Raises:
        Exception: 如果解密失败
    """
    from utils.crypto import decrypt_api_key
    
    return decrypt_api_key(
        encrypted_key=api_key_record.encrypted_key,
        iv=api_key_record.iv,
        tag=api_key_record.tag
    )
