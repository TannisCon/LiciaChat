"""
History API 模块 - 实现对话持久化功能
"""
import json
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

# 使用 try-except 确保在不同 Python 版本下都能正确导入 uuid7 
# Python 3.14 及以上版本标准库包含 uuid7，之前版本需要使用自带的 uuid7 实现
try:
    from uuid import uuid7  # type: ignore[attr-defined, unused-ignore]
except ImportError:
    try:
         from utils.uuid_utils import uuid7
    except ImportError:
        raise ImportError("Need uuid7 support for chat-id format, please use python 3.14+")

from sqlmodel import SQLModel, Field, Session, select
from sqlalchemy import desc
from openai import AsyncOpenAI

from appinit import (
    config,
    get_engine,
    SessionLocal,
    DB_PATH,
    Chat,
    MAX_RECENT_ROUNDS,
    FORCE_DEQUEUE_ROUNDS,
    COMPRESS_TIMEOUT,
    COMPRESS_MAX_RETRIES,
    LITE_LLM_MODEL,
    DASHSCOPE_BASE_URL,
    DASHSCOPE_API_KEY,
)
from utils.load_prompts import get_prompt


def get_openai_client(api_key: Optional[str] = None, base_url: Optional[str] = None) -> AsyncOpenAI:
    """创建 OpenAI 客户端
    
    Args:
        api_key: API Key，如果提供则使用传入的 key，否则使用全局配置
        base_url: API Base URL，如果提供则使用传入的 URL，否则使用全局配置
        
    Returns:
        AsyncOpenAI: OpenAI 客户端
    """
    return AsyncOpenAI(
        api_key=api_key if api_key else DASHSCOPE_API_KEY,
        base_url=base_url if base_url else DASHSCOPE_BASE_URL
    )


def _generate_chat_uuid() -> str:
    """生成 chat-uuid7 格式的 chat_id（内部函数）
    
    优先使用 uuid7 生成 ID，如果失败则回退到 uuid4
    """
    try:
        # 尝试使用 uuid7 生成唯一 ID，前缀为 "chat-"
        return f"chat-{uuid7()}"
    except Exception:
        # uuid7 失败时回退到 uuid4
        from uuid import uuid4
        return f"chat-{uuid4()}"


def get_current_timestamp() -> int:
    """获取当前 UTC 时间戳（秒）"""
    return int(datetime.utcnow().timestamp())


def create_chat(user_uuid: str) -> Optional[Chat]:
    """创建新对话
    
    Args:
        user_uuid: 用户 UUID
        
    Returns:
        创建的 Chat 对象，如果失败返回 None
    """
    engine = get_engine()
    
    with Session(engine) as session:
        chat = Chat(
            chat_id=_generate_chat_uuid(),
            uuid=user_uuid,
            title="新对话",
            created_at=get_current_timestamp(),
            updated_at=get_current_timestamp(),
            history_recent="[]",
            history_full="[]",
            history_compressed="[]",
            total_rounds=None,
            total_tokens=None
        )
        print(chat.chat_id)
        session.add(chat)
        session.commit()
        session.refresh(chat)
        
        return chat


# def get_chat_by_id(chat_id: str) -> Optional[Chat]:
#     """通过 chat_id 获取对话
    
#     Args:
#         chat_id: 对话 ID
        
#     Returns:
#         Chat 对象，如果不存在返回 None
#     """
#     engine = get_engine()
    
#     with Session(engine) as session:
#         statement = select(Chat).where(Chat.chat_id == chat_id)
#         chat = session.exec(statement).first()
#         return chat


def get_chat_by_id_and_uuid(chat_id: str, user_uuid: str) -> Optional[Chat]:
    """通过 chat_id 和用户 UUID 获取对话（验证所有权）
    
    Args:
        chat_id: 对话 ID
        user_uuid: 用户 UUID
        
    Returns:
        Chat 对象，如果不存在或不属于该用户返回 None
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(
            Chat.chat_id == chat_id,
            Chat.uuid == user_uuid
        )
        chat = session.exec(statement).first()
        return chat


def get_all_chats_by_user(user_uuid: str) -> List[Chat]:
    """获取用户的所有对话（按更新时间降序）
    
    Args:
        user_uuid: 用户 UUID
        
    Returns:
        Chat 列表
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.uuid == user_uuid).order_by(desc(Chat.updated_at))  # type: ignore
        chats = session.exec(statement).all()
        return list(chats)


def truncate_title(title: str, max_chinese_chars: int = 20) -> str:
    """截断标题，使其不超过指定的中文字符数
    
    Args:
        title: 原始标题
        max_chinese_chars: 最大中文字符数
        
    Returns:
        截断后的标题
    """
    # 计算中文字符数（包括中文标点）
    chinese_char_count = 0
    byte_length = 0
    
    for char in title:
        # 判断是否为中文字符（Unicode 范围）
        if '\u4e00' <= char <= '\u9fff' or '\u3000' <= char <= '\u303f':
            chinese_char_count += 1
        byte_length += 1
        
        if chinese_char_count > max_chinese_chars:
            # 截断并添加省略号
            return title[:byte_length - 1] + "..."
    
    return title


def update_chat_title(chat_id: str, title: str, user_uuid: Optional[str] = None) -> dict:
    """更新对话标题
    
    Args:
        chat_id: 对话 ID
        title: 新标题
        user_uuid: 可选的用户 UUID，如果提供则验证所有权
        
    Returns:
        dict: {
            "success": bool,
            "chat_id": str,
            "title": str,
            "error": Optional[str]
        }
    """
    engine = get_engine()
    
    # 截断标题（如果超过 20 个中文字符）
    truncated_title = truncate_title(title, 20)
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        
        if chat is None:
            return {
                "success": False,
                "chat_id": chat_id,
                "title": None,
                "error": "对话不存在"
            }
        
        # 如果提供了 user_uuid，验证所有权
        if user_uuid is not None and chat.uuid != user_uuid:
            return {
                "success": False,
                "chat_id": chat_id,
                "title": None,
                "error": "无权访问该对话"
            }
        
        chat.title = truncated_title
        chat.updated_at = get_current_timestamp()
        session.add(chat)
        session.commit()
        
        return {
            "success": True,
            "chat_id": chat_id,
            "title": truncated_title,
            "error": None
        }


def _count_rounds(history_list: List[Dict[str, Any]]) -> int:
    """计算历史列表中的对话轮数（每轮包含 user + assistant 两条消息）"""
    return len(history_list) // 2


def _extract_round(history_list: List[Dict[str, Any]], round_index: int) -> Tuple[str, str]:
    """从历史列表中提取指定轮次的对话
    
    Args:
        history_list: 历史消息列表
        round_index: 轮次索引（从 0 开始）
        
    Returns:
        (user_message, assistant_message) 2 元组
    """
    start_index = round_index * 2
    if start_index + 1 >= len(history_list):
        return ("", "")
    
    user_msg = history_list[start_index].get("content", "") if history_list[start_index].get("role") == "user" else ""
    assistant_msg = history_list[start_index + 1].get("content", "") if history_list[start_index + 1].get("role") == "assistant" else ""
    
    return (user_msg, assistant_msg)


async def compress_dialog_round(
    user_message: str,
    assistant_message: str,
    round_count: int,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """异步调用 lite_llm_model 的 api 对单轮对话进行结构化摘要
    
    Args:
        user_message: 用户消息
        assistant_message: 助手回复
        round_count: 当前轮次计数
        api_key: API Key（BYOK 用户使用），如果为 None 则使用全局配置
        base_url: API Base URL（BYOK 用户使用），如果为 None 则使用全局配置
        
    Returns:
        压缩后的对话记录，格式为：
        {"round": round_count, "role": "user", "content": compressed_user}
        {"round": round_count, "role": "assistant", "content": compressed_assistant}
        如果失败返回 None
    """
    system_prompt = get_prompt("compress_dialog")
    user_prompt = f"""用户消息：
{user_message}

助手回复：
{assistant_message}"""
    
    # 使用传入的 api_key 和 base_url 创建客户端
    client = get_openai_client(api_key=api_key, base_url=base_url)
    
    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=LITE_LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.5,
                max_tokens=4096,
                extra_body={
                    "enable_thinking": False
                }
            ),
            timeout=COMPRESS_TIMEOUT
        )
        
        if response.choices and len(response.choices) > 0:
            content = response.choices[0].message.content
            if content:
                # 尝试解析 JSON 响应
                try:
                    # 清理可能的 markdown 标记
                    content = content.strip()
                    if content.startswith("```json"):
                        content = content[7:]
                    if content.endswith("```"):
                        content = content[:-3]
                    content = content.strip()
                    
                    result = json.loads(content)
                    user_summary = result.get("user_summary", "")
                    assistant_summary = result.get("assistant_summary", "")
                    
                    if user_summary and assistant_summary:
                        # 返回压缩后的对话记录
                        return {
                            "round": round_count,
                            "messages": [
                                {"role": "user", "content": user_summary},
                                {"role": "assistant", "content": assistant_summary}
                            ]
                        }
                except json.JSONDecodeError as e:
                    print(f"解析摘要响应失败：{e}")
                    return None
        
        return None
        
    except asyncio.TimeoutError:
        print(f"摘要请求超时（{COMPRESS_TIMEOUT}秒）")
        return None
    except Exception as e:
        print(f"摘要请求失败：{e}")
        return None


def _save_chat_history(
    chat: Chat,
    history_recent: List[Dict[str, Any]],
    history_compressed: Optional[List[Dict[str, Any]]] = None
) -> bool:
    """保存更新后的历史记录到数据库
    
    Args:
        chat: Chat 对象
        history_recent: 更新后的最近历史
        history_compressed: 可选的压缩历史记录（如果提供则追加）
        
    Returns:
        是否保存成功
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 重新获取最新的 chat 对象
        statement = select(Chat).where(Chat.chat_id == chat.chat_id)
        db_chat = session.exec(statement).first()
        if db_chat is None:
            return False
        
        # 更新 history_recent
        db_chat.history_recent = json.dumps(history_recent, ensure_ascii=False)
        db_chat.updated_at = get_current_timestamp()
        
        # 如果提供了摘要历史，追加到 history_compressed
        if history_compressed:
            try:
                existing_compressed = json.loads(db_chat.history_compressed or "[]")
            except json.JSONDecodeError:
                existing_compressed = []
            
            existing_compressed.extend(history_compressed)
            db_chat.history_compressed = json.dumps(existing_compressed, ensure_ascii=False)
        
        session.add(db_chat)
        session.commit()
        return True


async def process_queue_dequeue(
    chat_id: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> bool:
    """处理队头对话出队
    
    当 history_recent 超过 MAX_RECENT_ROUNDS 时，对队头对话进行摘要并存储到 history_compressed
    如果摘要失败或超过 FORCE_DEQUEUE_ROUNDS，直接存储全量对话
    
    Args:
        chat_id: 对话 ID
        api_key: API Key（BYOK 用户使用），如果为 None 则使用全局配置
        base_url: API Base URL（BYOK 用户使用），如果为 None 则使用全局配置
        
    Returns:
        是否处理成功
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return False
        
        try:
            history_recent = json.loads(chat.history_recent or "[]")
            history_compressed = json.loads(chat.history_compressed or "[]")
        except json.JSONDecodeError:
            history_recent = []
            history_compressed = []
    
    # 计算当前轮数
    current_rounds = _count_rounds(history_recent)
    
    if current_rounds <= MAX_RECENT_ROUNDS:
        # 未超过阈值，不需要出队
        return True
    
    # 提取队头对话（第一轮）
    user_message, assistant_message = _extract_round(history_recent, 0)
    
    # 计算新的 round_count
    compressed_rounds = _count_rounds(history_compressed)
    new_round_count = compressed_rounds + 1
    
    # 检查是否需要强制出队
    force_dequeue = current_rounds >= FORCE_DEQUEUE_ROUNDS
    
    compressed_entry = None
    
    if not force_dequeue:
        # 尝试进行摘要（带重试）
        for attempt in range(COMPRESS_MAX_RETRIES):
            print(f"正在对第 {new_round_count} 轮对话进行摘要（尝试 {attempt + 1}/{COMPRESS_MAX_RETRIES}）...")
            compressed_entry = await compress_dialog_round(
                user_message, assistant_message, new_round_count,
                api_key=api_key, base_url=base_url
            )
            if compressed_entry:
                print(f"摘要成功：{compressed_entry}")
                break
            else:
                print(f"摘要失败，准备重试...")
                await asyncio.sleep(1)  # 重试前等待 1 秒
        
        if not compressed_entry:
            print(f"摘要达到最大重试次数，使用全量对话")
    
    # 如果摘要失败或强制出队，使用全量对话
    if not compressed_entry:
        compressed_entry = {
            "round": new_round_count,
            "messages": [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": assistant_message}
            ]
        }
    
    # 从 history_recent 中移除队头对话（前两条消息）
    messages_per_round = 2
    history_recent = history_recent[messages_per_round:]
    
    # 构建要追加到 history_compressed 的内容
    # 需要将 round 信息展开为扁平的消息列表
    compressed_to_append = [
        {"round": new_round_count},
        compressed_entry["messages"][0],
        compressed_entry["messages"][1]
    ]
    
    # 保存到数据库
    return _save_chat_history(chat, history_recent, compressed_to_append)


def append_history(
    chat_id: str,
    user_message: str,
    assistant_message: str,
    max_recent_rounds: Optional[int] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None
) -> bool:
    """追加对话历史
    
    将一轮对话（用户消息和助手回复）添加到历史记录中
    如果 history_recent 超过阈值，会自动触发异步摘要和出队
    
    Args:
        chat_id: 对话 ID
        user_message: 用户消息
        assistant_message: 助手回复
        max_recent_rounds: history_recent 保留的最大轮数（已废弃，使用配置文件中的配置）
        api_key: API Key（BYOK 用户使用），如果为 None 则使用全局配置
        base_url: API Base URL（BYOK 用户使用），如果为 None 则使用全局配置
        model: 可选的模型 ID，如果提供则更新 chat 的 current_model
        
    Returns:
        是否更新成功
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return False
        
        # 解析现有历史
        try:
            history_full = json.loads(chat.history_full or "[]")
            history_recent = json.loads(chat.history_recent or "[]")
        except json.JSONDecodeError:
            history_full = []
            history_recent = []
        
        # 构建新的对话轮次
        new_round = [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_message}
        ]
        
        # 追加到 history_full
        history_full.extend(new_round)
        
        # 追加到 history_recent
        history_recent.extend(new_round)
        
        # 更新对话记录
        chat.history_full = json.dumps(history_full, ensure_ascii=False)
        chat.history_recent = json.dumps(history_recent, ensure_ascii=False)
        chat.updated_at = get_current_timestamp()
        
        session.add(chat)
        session.commit()
        
        # 如果提供了 model，更新 current_model（使用同一个 session）
        if model:
            update_chat_current_model(chat_id, model, session=session)
    
    # 检查是否需要触发异步出队
    current_rounds = _count_rounds(history_recent)
    if current_rounds > MAX_RECENT_ROUNDS:
        # 异步触发队列处理（传入 api_key 和 base_url）
        asyncio.create_task(process_queue_dequeue(chat_id, api_key=api_key, base_url=base_url))
        print(f"触发异步出队处理，当前轮数：{current_rounds}")
    
    return True


def get_history_full(chat_id: str) -> Optional[List[Dict[str, Any]]]:
    """获取完整的对话历史
    
    Args:
        chat_id: 对话 ID
        
    Returns:
        完整的 history_full 列表，如果不存在返回 None
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return None
        
        try:
            return json.loads(chat.history_full or "[]")
        except json.JSONDecodeError:
            return []


def get_history_recent(chat_id: str) -> Optional[List[Dict[str, Any]]]:
    """获取最近的对话历史
    
    Args:
        chat_id: 对话 ID
        
    Returns:
        最近的 history_recent 列表，如果不存在返回 None
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return None
        
        try:
            return json.loads(chat.history_recent or "[]")
        except json.JSONDecodeError:
            return []


def get_history_compressed(chat_id: str) -> Optional[List[Dict[str, Any]]]:
    """获取压缩的对话历史
    
    Args:
        chat_id: 对话 ID
        
    Returns:
        history_compressed 列表，如果不存在返回 None
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return None
        
        try:
            return json.loads(chat.history_compressed or "[]")
        except json.JSONDecodeError:
            return []


def get_combined_history(chat_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """获取拼接后的完整历史
    
    Args:
        chat_id: 对话 ID
        
    Returns:
        (compressed_messages, recent_messages) 元组
        compressed_messages: 摘要历史中的消息列表（已去除 round 元数据）
        recent_messages: 最近历史中的消息列表
    """
    engine = get_engine()
    
    with Session(engine) as session:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return ([], [])
        
        # 解析摘要历史
        try:
            history_compressed = json.loads(chat.history_compressed or "[]")
        except json.JSONDecodeError:
            history_compressed = []
        
        # 解析最近历史
        try:
            history_recent = json.loads(chat.history_recent or "[]")
        except json.JSONDecodeError:
            history_recent = []
        
        # 从摘要历史中提取消息（去除 round 元数据）
        compressed_messages = []
        for item in history_compressed:
            if isinstance(item, dict) and "role" in item:
                # 只保留 role 和 content
                compressed_messages.append({
                    "role": item.get("role", ""),
                    "content": item.get("content", "")
                })
        
        return (compressed_messages, history_recent)


def delete_chat(chat_id: str, user_uuid: str) -> bool:
    """删除对话（验证所有权）
    
    Args:
        chat_id: 对话 ID
        user_uuid: 用户 UUID
        
    Returns:
        是否删除成功
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 使用 select 查询，因为 chat_id 不是主键
        statement = select(Chat).where(
            Chat.chat_id == chat_id,
            Chat.uuid == user_uuid
        )
        chat = session.exec(statement).first()
        if chat is None:
            return False
        
        session.delete(chat)
        session.commit()
        return True


def chat_exists(chat_id: str) -> bool:
    """检查对话是否存在
    
    Args:
        chat_id: 对话 ID
        
    Returns:
        是否存在
    """
    engine = get_engine()
    
    with Session(engine) as session:
        # 使用 select 查询，因为 chat_id 不是主键
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        return chat is not None


def update_chat_current_model(chat_id: str, model: str, session: Optional[Session] = None) -> bool:
    """更新对话的 current_model 字段
    
    仅在以下情况更新：
    1. 当前 chat 记录中 current_model 为 None 或空
    2. 传入的 model 与当前记录的 current_model 不相同
    
    Args:
        chat_id: 对话 ID
        model: 要设置的模型 ID
        session: 可选的 Session 对象，如果提供则使用该 Session，避免嵌套
        
    Returns:
        是否更新成功
    """
    engine = get_engine()
    
    # 如果未提供 session，创建新的；否则使用传入的 session
    should_close = False
    if session is None:
        session = Session(engine)
        should_close = True
    
    try:
        statement = select(Chat).where(Chat.chat_id == chat_id)
        chat = session.exec(statement).first()
        if chat is None:
            return False
        
        # 检查是否需要更新
        current_model = chat.current_model
        if current_model and current_model == model:
            # 已有相同的 model，无需更新
            return True
        
        # 更新 current_model
        chat.current_model = model
        session.add(chat)
        session.commit()
        return True
    finally:
        # 仅当自己创建的 session 时才关闭
        if should_close:
            session.close()
