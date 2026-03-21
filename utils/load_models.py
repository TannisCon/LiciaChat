"""
Models 动态加载工具

提供工具函数实时加载模型列表配置，从 ./dynamic_config/models.json 加载
使用模块级缓存 + 文件修改时间检测实现热重载，降低 IO 开销
"""

import os
import json
from typing import Dict, Any, Optional, List
from pathlib import Path
import threading

# 模块级缓存
_models_cache: Optional[Dict[str, Any]] = None
_file_mtime: float = 0.0
_lock = threading.Lock()

# 配置文件路径（相对于当前文件）
_CONFIG_PATH = Path(__file__).parent.parent / "dynamic_config" / "models.json"


def _load_models_from_file() -> Dict[str, Any]:
    """从 JSON 文件加载模型列表
    
    Returns:
        Dict[str, Any]: 模型列表字典
        
    Raises:
        FileNotFoundError: 如果配置文件不存在
        ValueError: 如果配置文件格式错误
    """
    if not _CONFIG_PATH.exists():
        raise FileNotFoundError(f"模型配置文件不存在：{_CONFIG_PATH}")
    
    with open(_CONFIG_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not isinstance(data, dict) or "data" not in data:
        raise ValueError("模型配置文件格式错误，应包含 'data' 字段")
    
    return data


def get_models() -> Dict[str, Any]:
    """获取模型列表配置（带缓存）
    
    每次调用会检查文件修改时间，如果文件已更新则重新加载
    线程安全：使用锁保护缓存更新
    
    Returns:
        Dict[str, Any]: 模型列表字典，符合 OpenAI v1/models 响应格式
        
    Raises:
        FileNotFoundError: 如果配置文件不存在
    """
    global _models_cache, _file_mtime
    
    # 检查文件当前修改时间
    try:
        current_mtime = os.path.getmtime(_CONFIG_PATH)
    except OSError:
        if _models_cache is not None:
            return _models_cache
        raise FileNotFoundError(f"模型配置文件不存在：{_CONFIG_PATH}")
    
    # 缓存命中检查
    if _models_cache is not None and current_mtime == _file_mtime:
        return _models_cache
    
    # 缓存未命中或文件已更新，需要重新加载
    with _lock:
        # 双重检查（防止竞态条件）
        if _models_cache is not None and current_mtime == _file_mtime:
            return _models_cache
        
        # 加载新配置
        new_models = _load_models_from_file()
        
        # 更新缓存
        _models_cache = new_models
        _file_mtime = current_mtime
        
        print(f"模型配置已重新加载：{_CONFIG_PATH}")
        return _models_cache


def clear_cache():
    """清除缓存（用于测试或强制刷新）"""
    global _models_cache, _file_mtime
    with _lock:
        _models_cache = None
        _file_mtime = 0.0