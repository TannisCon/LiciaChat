"""
Usage 信息标准化工具模块

提供统一的 usage 信息解析函数，兼容不同 LLM 提供商的 usage 输出格式，
将各种格式的 usage 信息标准化为统一结构，便于前端解析。

支持的输入格式：
- OpenAI / Qwen: prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details, completion_tokens_details
- Anthropic: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, thinking_tokens
- Gemini: usage_metadata.prompt_token_count, usage_metadata.candidates_token_count, etc.

标准化输出格式：
{
    "prompt_tokens": int,
    "completion_tokens": int,
    "total_tokens": int,
    "prompt_tokens_details": {
        "cached_tokens": int  # 如果存在
    },
    "completion_tokens_details": {
        "reasoning_tokens": int  # 如果存在
    }
}
"""

from typing import Any, Dict, Optional, Union


def normalize_usage(usage: Optional[Any]) -> Dict[str, Any]:
    """标准化 usage 信息，兼容不同模型的输出格式
    
    Args:
        usage: 原始 usage 对象，可能是 dict 或 object 类型
        
    Returns:
        Dict: 标准化后的 usage 字典
    """
    if not usage:
        return {}
    # print(f"原始 usage 数据: {usage}")

    # ---------- 通用访问 ----------
    def _get(obj: Any, key: str, default: Any = None) -> Any:
        """通用属性/键值访问函数
        
        支持 dict 和 object 两种类型，统一访问接口
        
        Args:
            obj: 要访问的对象
            key: 要访问的键名或属性名
            default: 默认值，当键/属性不存在时返回
            
        Returns:
            访问结果或默认值
        """
        if obj is None:
            return default
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    def _get_path(obj: Any, path: list) -> Any:
        """路径访问函数，用于访问嵌套的属性/键值
        
        Args:
            obj: 要访问的对象
            path: 路径列表，如 ["prompt_tokens_details", "cached_tokens"]
            
        Returns:
            访问结果，如果路径中任何一环为 None 则返回 None
        """
        for key in path:
            obj = _get(obj, key)
            if obj is None:
                return None
        return obj

    # ---------- 基础 tokens（跨厂商统一） ----------
    prompt_tokens = (
        _get(usage, "prompt_tokens") or                      # OpenAI / Qwen
        _get(usage, "input_tokens") or                       # Anthropic
        _get_path(usage, ["usage_metadata", "prompt_token_count"]) or  # Gemini
        0
    )

    completion_tokens = (
        _get(usage, "completion_tokens") or                  # OpenAI / Qwen
        _get(usage, "output_tokens") or                      # Anthropic
        _get_path(usage, ["usage_metadata", "candidates_token_count"]) or  # Gemini
        0
    )

    total_tokens = (
        _get(usage, "total_tokens") or
        _get(usage, "total_token_count") or                  # Gemini
        (prompt_tokens + completion_tokens)
    )

    result: Dict[str, Any] = {
        "prompt_tokens": int(prompt_tokens or 0),
        "completion_tokens": int(completion_tokens or 0),
        "total_tokens": int(total_tokens or 0),
    }

    # ---------- cached_tokens ----------
    cached_tokens = (
        # Qwen / OpenAI 扩展
        _get_path(usage, ["prompt_tokens_details", "cached_tokens"]) or
        _get(usage, "cached_tokens") or

        # Anthropic cache（Claude cache）
        _get(usage, "cache_read_input_tokens") or
        _get(usage, "cache_creation_input_tokens") or

        # Gemini（有些实现会放这里）
        _get_path(usage, ["usage_metadata", "cached_content_token_count"])
    )

    if cached_tokens is not None:
        result["prompt_tokens_details"] = {
            "cached_tokens": int(cached_tokens)
        }

    # ---------- reasoning_tokens ----------
    reasoning_tokens = (
        # Qwen / OpenAI 扩展
        _get(usage, "reasoning_tokens") or
        _get_path(usage, ["completion_tokens_details", "reasoning_tokens"]) or
        _get_path(usage, ["completion_tokens", "reasoning_tokens"]) or

        # Anthropic（Claude 3.5+ thinking）
        _get(usage, "thinking_tokens") or

        # Gemini（部分推理模型）
        _get_path(usage, ["usage_metadata", "reasoning_token_count"])
    )

    if reasoning_tokens is not None:
        result["completion_tokens_details"] = {
            "reasoning_tokens": int(reasoning_tokens)
        }

    return result