"""
Prompts 动态加载工具

提供工具函数实时加载和更新提示词配置，从 ./dynamic_config/prompts.yaml 加载
使用模块级缓存 + 文件修改时间检测实现热重载，降低 IO 开销
"""

import os
import yaml
from typing import Dict, Any, Optional
from pathlib import Path
import threading

# 模块级缓存
_prompts_cache: Optional[Dict[str, str]] = None
_file_mtime: float = 0.0
_lock = threading.Lock()

# 配置文件路径（相对于当前文件）
_CONFIG_PATH = Path(__file__).parent.parent / "dynamic_config" / "prompts.yaml"


def _load_prompts_from_file() -> Dict[str, str]:
    """从 YAML 文件加载提示词
    
    Returns:
        Dict[str, str]: 提示词字典
        
    Raises:
        FileNotFoundError: 如果配置文件不存在
        ValueError: 如果配置文件格式错误
    """
    if not _CONFIG_PATH.exists():
        raise FileNotFoundError(f"提示词配置文件不存在：{_CONFIG_PATH}")
    
    with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    if not isinstance(data, dict):
        raise ValueError("提示词配置文件格式错误，根节点必须是 YAML 字典")
    
    # rstrip 掉多余的换行符
    return {key: str(value).rstrip() for key, value in data.items()}


def get_prompts() -> Dict[str, str]:
    """获取提示词配置（带缓存）
    
    每次调用会检查文件修改时间，如果文件已更新则重新加载
    线程安全：使用锁保护缓存更新
    
    Returns:
        Dict[str, str]: 提示词字典，键为提示词名称，值为提示词内容
        
    Raises:
        FileNotFoundError: 如果配置文件不存在
    """
    global _prompts_cache, _file_mtime
    
    # 检查文件当前修改时间
    try:
        current_mtime = os.path.getmtime(_CONFIG_PATH)
    except OSError:
        if _prompts_cache is not None:
            return _prompts_cache
        raise FileNotFoundError(f"提示词配置文件不存在：{_CONFIG_PATH}")
    
    # 缓存命中检查
    if _prompts_cache is not None and current_mtime == _file_mtime:
        return _prompts_cache
    
    # 缓存未命中或文件已更新，需要重新加载
    with _lock:
        # 双重检查（防止竞态条件）
        if _prompts_cache is not None and current_mtime == _file_mtime:
            return _prompts_cache
        
        # 加载新配置
        new_prompts = _load_prompts_from_file()
        
        # 更新缓存
        _prompts_cache = new_prompts
        _file_mtime = current_mtime
        
        print(f"提示词配置已重新加载：{_CONFIG_PATH}")
        return _prompts_cache


def get_prompt(name: str) -> str:
    """获取指定名称的提示词
    
    Args:
        name: 提示词名称，如 'chat_system', 'compress_dialog', 'generate_title'
        
    Returns:
        str: 提示词内容
        
    Raises:
        KeyError: 如果提示词不存在
    """
    prompts = get_prompts()
    if name not in prompts:
        raise KeyError(f"提示词 '{name}' 不存在，可用的提示词：{list(prompts.keys())}")
    return prompts[name]


def clear_cache():
    """清除缓存（用于测试或强制刷新）"""
    global _prompts_cache, _file_mtime
    with _lock:
        _prompts_cache = None
        _file_mtime = 0.0