"""
Chat API 模块 - 实现 OpenAI 兼容的 Chat API endpoint, 支持流式响应、对话持久化、自动标题生成、推理内容分离等功能
"""
import asyncio
import json
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI

from auth import User
from history import (
    # get_history_recent,
    append_history,
    update_chat_title,
    get_history_full,
    get_combined_history,
    ChatNotFoundError,
    ChatAccessDeniedError
)
from appinit import (
    MAIN_LLM_MODEL,
    LITE_LLM_MODEL,
    DASHSCOPE_BASE_URL,
    DASHSCOPE_API_KEY,
)
from utils.apikeytool import get_user_api_key, decrypt_api_key_record
from utils.usage import normalize_usage
from utils.load_prompts import get_prompt
from utils.load_models import get_models

# 标题生成超时时间（秒）
TITLE_GENERATION_TIMEOUT = 20

# 检查 API Key 是否配置
if not DASHSCOPE_API_KEY:
    print("警告：未配置有效的 DASHSCOPE_API_KEY，请设置环境变量或在 config.yaml 中配置")


def _check_request_model(
    requested_model: Optional[str],
    chat_current_model: Optional[str]
) -> str:
    """检查并确定使用的模型
    
    优先级：
    1. 请求中的 model 字段（如果存在于 models.json 中）
    2. chat 记录的 current_model 字段（如果存在于 models.json 中）
    3. 系统默认 MAIN_LLM_MODEL
    
    Args:
        requested_model: 请求中的 model 字段
        chat_current_model: chat 记录的 current_model 字段
        
    Returns:
        str: 实际使用的模型 ID
    """
    # 获取有效的模型列表
    models_data = get_models()
    valid_model_ids = [model["id"] for model in models_data.get("data", [])]
    
    # 1. 检查请求中的 model
    if requested_model and requested_model in valid_model_ids:
        return requested_model
    
    # 2. 检查 chat 的 current_model
    if chat_current_model and chat_current_model in valid_model_ids:
        return chat_current_model
    
    # 3.看看MAIN_LLM_MODEL
    if MAIN_LLM_MODEL in valid_model_ids:
        return MAIN_LLM_MODEL

    # 最后兜底：取第一个可用模型
    if valid_model_ids:
        return next(iter(valid_model_ids))

    # 这次是真的兜底了，返回 MAIN_LLM_MODEL（即使它不在 models.json 中，也保证有一个默认值），并炸掉
    print("警告：模型列表无效且主模型配置错误，返回 MAIN_LLM_MODEL 作为默认值，请检查模型配置")
    return MAIN_LLM_MODEL


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


def extract_last_user_message(messages: List[Dict[str, Any]]) -> Optional[str]:
    """从 messages 中提取最后一条 user message"""
    if not messages:
        return None
    
    # 从后往前找第一条 user message
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, str):
                return content
            elif isinstance(content, list):
                # 处理多模态内容
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        return item.get("text", "")
                # 如果没有 text 类型，尝试获取第一个元素的 text
                if content:
                    first_item = content[0]
                    if isinstance(first_item, dict):
                        result = first_item.get("text", "") or first_item.get("content", "")
                        return str(result) if result else None
            return str(content) if content else None
    
    return None


async def generate_chat_title(
    chat_id: str,
    messages: List[Dict[str, Any]],
    response_content: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
):
    """异步生成对话标题
    
    使用轻量 LLM 模型总结第一轮对话内容，生成简短标题（不超过 15 个中文字符）
    
    Args:
        chat_id: 对话 ID
        messages: 对话消息列表
        response_content: AI 回复内容
        api_key: API Key（BYOK 用户使用），如果为 None 则使用全局配置
        base_url: API Base URL（BYOK 用户使用），如果为 None 则使用全局配置
    """
    try:
        # 构建用于总结的 prompt
        user_message = None
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
                break
        
        if not user_message:
            return
        
        # 构建总结请求
        system_prompt = get_prompt("generate_title")
        summary_prompt = f"""'用户提问'：{user_message}
'AI 回答'：{response_content[:500]}"""
        
        # 创建客户端用于标题生成（使用传入的 api_key 和 base_url）
        title_client = get_openai_client(api_key=api_key, base_url=base_url)
        
        # 调用 LLM API（非流式，带超时）
        response = await asyncio.wait_for(
            title_client.chat.completions.create(
                model=LITE_LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": summary_prompt}
                ],
                max_tokens=50,
                temperature=0.1,
                extra_body={
                    "enable_thinking": False
                }
            ),
            timeout=TITLE_GENERATION_TIMEOUT
        )
        
        # 提取生成的标题
        title = None
        if response.choices:
            content = response.choices[0].message.content
            if content:
                title = content.strip()
        
        if title:
            # 确保标题不超过 24 个中文字符
            if len(title) > 24:
                title = title[:24]
            
            # 更新对话标题（不传入 user_uuid，因为这是后台自动操作）
            # 如果对话不存在或无权访问，异常会被静默捕获
            update_chat_title(chat_id, title)
            print(f"对话标题已更新：{title}")
        
    except asyncio.TimeoutError:
        print(f"标题生成超时（{TITLE_GENERATION_TIMEOUT}秒），跳过标题生成")
    except (ChatNotFoundError, ChatAccessDeniedError):
        # 标题生成是后台异步操作，对话可能已被删除，静默处理异常
        pass
    except Exception as e:
        print(f"标题生成失败：{e}")


def _build_chunk(
    chunk_id: str,
    created: int,
    model: str,
    delta: Dict[str, Any],
    finish_reason: Optional[str] = None
) -> Dict[str, Any]:
    """构建 SSE chunk 数据
    
    OpenAI 标准行为：
    - 第一个 chunk 仅包含 role 字段用于初始化
    - 后续 chunk 仅包含 content 或 reasoning_content 字段
    - 最后一个 chunk 包含 finish_reason
    
    Args:
        chunk_id: chunk ID
        created: 时间戳
        model: 模型名称
        delta: delta 内容（包含 role/content/reasoning_content）
        finish_reason: 结束原因（仅最后一个 chunk 需要）
        
    Returns:
        Dict: 构建好的 chunk 数据
    """
    return {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "delta": delta,
            "finish_reason": finish_reason
        }]
    }


async def stream_response(
    request: Request,
    client: AsyncOpenAI,
    messages: List[Dict[str, Any]],
    enable_thinking: Optional[bool] = False,
    persist: bool = False,
    chat_id: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: str = MAIN_LLM_MODEL
):
    """流式转发 LLM 响应，同时解析 usage 信息
    
    推理内容（reasoning_content）也会流式转发到前端，同时监听 reasoning，统一使用 reasoning_content 字段转发
    response_content 只记录最终回答内容，不包含推理内容
    
    OpenAI 兼容行为：
    - 第一个 chunk 发送 role: "assistant" 用于前端初始化
    - 后续 chunk 仅发送 content 或 reasoning_content，不包含 role
    
    Args:
        request: FastAPI 请求对象
        client: AsyncOpenAI 客户端
        messages: 消息列表
        enable_thinking: 是否启用推理，默认 False
        persist: 是否持久化对话，默认 False
        chat_id: 对话 ID（仅在 persist=True 时使用）
        api_key: API Key（BYOK 用户使用），如果为 None 则使用全局配置
        base_url: API Base URL（BYOK 用户使用），如果为 None 则使用全局配置
    """
    
    # 构建请求参数 - enable_thinking 在 extra_body 中，与 messages 同一层级
    chat_kwargs = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
        "extra_body": {
            "enable_search": True,
            "enable_thinking": enable_thinking  # 默认 False，如果传入 True 则启用
        }        
    }
    
    try:
        stream = await client.chat.completions.create(**chat_kwargs)
        
        # 用于暂存回答和 usage 信息
        response_content = ""
        usage_info = {}
        # 标记是否已发送 role（OpenAI 标准：仅第一个 chunk 发送 role）
        role_sent = False
        # 用于记录上游返回的实际 model
        upstream_model: Optional[str] = None
        
        async for chunk in stream:
            # 检查前端连接是否断开
            if await request.is_disconnected():
                print("前端连接断开，终止流式传输")
                return
            
            # 记录上游返回的 model（用于最后一个 chunk）
            if hasattr(chunk, 'model') and chunk.model:
                upstream_model = chunk.model
            
            # 解析 chunk
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                chunk_data = None
                
                # 检查是否有 reasoning_content（推理内容）
                reasoning_content = None
                if hasattr(delta, 'reasoning_content') and delta.reasoning_content is not None:
                    reasoning_content = delta.reasoning_content
                elif hasattr(delta, 'reasoning') and delta.reasoning is not None:
                    reasoning_content = delta.reasoning  # 兼容新 vllm 字段

                # 1. 优先处理 role chunk（独立发送）
                # 无需判断上游是否有 role，只要没发过 role 就直接发送
                if not role_sent:
                    chunk_data = _build_chunk(
                        chunk_id=chunk.id,
                        created=chunk.created,
                        model=chunk.model,
                        delta={"role": "assistant"}
                    )
                    yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
                    role_sent = True
                
                # 2. 处理 reasoning_content（独立于 content）
                if reasoning_content is not None:
                    chunk_data = _build_chunk(
                        chunk_id=chunk.id,
                        created=chunk.created,
                        model=chunk.model,
                        delta={"reasoning_content": reasoning_content}
                    )
                    yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
                
                # 3. 独立处理 content（使用并列 if，不与 reasoning 互斥）
                if hasattr(delta, 'content') and delta.content is not None:
                    # 累积记录本次回答内容（不包含推理内容）
                    response_content += delta.content
                    
                    chunk_data = _build_chunk(
                        chunk_id=chunk.id,
                        created=chunk.created,
                        model=chunk.model,
                        delta={"content": delta.content}
                    )
                    yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
            
            # 检查 usage 信息，使用标准化函数解析
            if hasattr(chunk, 'usage') and chunk.usage:
                usage_info = normalize_usage(chunk.usage)
                        
        # 构建并发送 usage 信息（如有）
        if usage_info:
            final_model = model # 防止上游因模型路由导致返回的 model 与请求不一致，优先使用请求的 model 以确保前端和后续处理逻辑能够使用正确的模型id
            final_chunk = {
                "id": "final",
                "object": "chat.completion.chunk",
                "created": 0,
                "model": final_model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }],
                "usage": usage_info
            }
            yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
            print(f"Usage 信息：{usage_info}")
        
        # 发送结束标记
        yield "data: [DONE]\n\n"
        
        # 完成流式传输后，将对话持久化到数据库（如果启用）
        if persist and chat_id and response_content:
            # 从 messages 中提取最后一条 user message
            user_message = None
            for msg in reversed(messages):
                if msg.get("role") == "user":
                    user_message = msg.get("content", "")
                    break
            
            if user_message:
                # 追加到历史记录（传入 api_key、base_url 和 model 用于 BYOK 用户的摘要生成和模型记录）
                append_history(
                    chat_id, user_message, response_content,
                    api_key=api_key, base_url=base_url, model=model
                )
                print(f"对话已保存到 {chat_id}")
                
                # 检查是否是第一轮对话（history_full 中只有一轮对话）
                history_full = get_history_full(chat_id) or []
                # 每轮对话包含 2 条消息（user + assistant），所以 2 条消息表示第一轮对话
                if len(history_full) == 2:
                    # 异步生成标题（不阻塞当前请求）
                    asyncio.create_task(
                        generate_chat_title(
                            chat_id, messages, response_content,
                            api_key=api_key, base_url=base_url
                        )
                    )
        
    except asyncio.CancelledError:
        print("请求被取消")
        raise
    except Exception as e:
        print(f"LLM API 请求错误：{e}")
        # 向前端发送错误信息 - 使用 json.dumps 确保正确的 JSON 格式
        error_chunk = {
            "error": {
                "message": str(e),
                "type": "upstream_error"
            }
        }
        yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"


async def handle_chat_completion(
    request: Request,
    current_user: User,
    chat_id: Optional[str] = None
) -> StreamingResponse:
    """处理 Chat 补全请求
    
    支持 OpenAI Chat Completions API 标准格式
    接受的参数包括：messages, model, temperature, max_tokens, top_p, 
    frequency_penalty, presence_penalty, stop, stream, user, enable_thinking 等
    其中只有 messages，model 和 enable_thinking 会被使用，其他参数会被接收但忽略
    
    BYOK 用户处理逻辑：
    1. 检查用户角色，如果不是 admin 则为 BYOK 用户
    2. 获取用户的 API Key 记录
    3. 检查 key 状态（只有 valid 才能使用，pending/invalid 都返回 401）
    4. 解密 API Key 用于请求上游 LLM
    
    Args:
        request: FastAPI 请求对象
        current_user: 当前认证用户
        chat_id: 对话 ID（如果提供则启用持久化）
        
    Returns:
        StreamingResponse: 流式响应
        
    Raises:
        HTTPException: 401 (API Key 无效/未配置/pending), 429 (配额不足)
    """
    
    try:
        # 解析请求体
        body = await request.json()
        
        # 必需参数：messages
        messages = body.get("messages", [])
        
        # 可选参数：model (OpenAI 标准字段)
        requested_model = body.get("model")
        
        # 可选参数：enable_thinking (自定义参数)
        # 支持两种格式：顶层 enable_thinking 或嵌套在 extra_body 中
        enable_thinking = body.get("enable_thinking")
        if enable_thinking is None:
            extra_body = body.get("extra_body")
            if isinstance(extra_body, dict):
                enable_thinking = extra_body.get("enable_thinking")
        
        # 验证必需参数
        if not messages or not isinstance(messages, list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请求必须包含 messages 数组"
            )
        
        # 提取最后一条 user message
        last_user_message = extract_last_user_message(messages)
        
        if not last_user_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="messages 中必须包含至少一条 user role 的消息"
            )
        
        # =========================================================================
        # BYOK 用户 API Key 检查
        # =========================================================================
        api_key: Optional[str] = None
        base_url: Optional[str] = None
        
        # 如果用户不是 admin，则为 BYOK 用户，需要获取并检查 API Key
        if current_user.role != "admin":
            # 获取用户的 API Key 记录
            api_key_record = get_user_api_key(current_user)
            
            if api_key_record is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="未找到 API Key 记录，请配置您的 API Key"
                )
            
            # 检查 API Key 状态
            # pending 和 invalid 都视为无效 key，返回 401
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
            
            # 状态为 valid，解密 API Key
            # 注意：明文 API Key 仅在内存中使用，不得记录到日志
            try:
                api_key = decrypt_api_key_record(api_key_record)
                base_url = api_key_record.base_url
            except Exception as e:
                print(f"API Key 解密失败：{e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="API Key 解密失败"
                )
        # =========================================================================
        
        # 确定使用的模型
        if chat_id:
            # 获取 chat 的 current_model
            from history import get_chat_by_id_and_uuid
            chat = get_chat_by_id_and_uuid(chat_id, current_user.uuid)
            chat_current_model = chat.current_model if chat else None
        else:
            chat_current_model = None
        
        # 使用 _check_request_model 确定实际使用的模型
        actual_model = _check_request_model(requested_model, chat_current_model)
        
        # 构建发送给 LLM 的 messages
        if chat_id:
            # 带持久化模式：获取压缩历史和最近历史并拼接
            # 格式：system prompt + history_compressed + history_recent + user prompt
            compressed_messages, history_recent = get_combined_history(chat_id)
            llm_messages = [
                {"role": "system", "content": get_prompt("chat_system")},  # 持久化对话的 system prompt
            ]
            llm_messages.extend(compressed_messages)  # 压缩历史（已去除 round 元数据）
            llm_messages.extend(history_recent)  # 最近历史
            llm_messages.append({"role": "user", "content": last_user_message})
        else:
            # 无状态模式：只发送当前 message
            llm_messages = [
                {"role": "system", "content": get_prompt("stateless_system")},  # system prompt
                {"role": "user", "content": last_user_message}
            ]
        
        # 创建 OpenAI 客户端（使用 BYOK 用户的 key 或全局配置）
        client = get_openai_client(api_key=api_key, base_url=base_url)
        
        # 请求 LLM API 并返回流式响应
        return StreamingResponse(
            stream_response(
                request, 
                client, 
                llm_messages, 
                enable_thinking,
                persist=(chat_id is not None),
                chat_id=chat_id,
                api_key=api_key,
                base_url=base_url,
                model=actual_model
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请求体必须是有效的 JSON 格式"
        )
    except Exception as e:
        print(f"处理请求时发生错误：{e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"处理请求时发生错误：{str(e)}"
        )