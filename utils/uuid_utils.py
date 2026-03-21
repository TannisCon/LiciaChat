
"""
兼容 uuid7 的封装模块
- Python >= 3.14 使用标准库 uuid7
- Python < 3.14 fallback 自定义 uuid7 实现
- 可选使用 uuid4 代替 uuid7
"""

import time
import os
import uuid

# -------- 自定义 uuid7 实现（用于 Python <3.14） --------
def _custom_uuid7():
    """
    简易 uuid7 生成函数
    - 基于时间戳 + 随机字节
    - 返回标准 UUID 字符串
    """
    t = int(time.time() * 1000)  # 毫秒
    t_bytes = t.to_bytes(6, 'big')  # 高 48 位
    r_bytes = os.urandom(10)        # 低 80 位随机
    b = bytearray(t_bytes + r_bytes)
    b[6] = (b[6] & 0x0F) | 0x70     # 设置版本 7 (msb4 = 0111)
    return str(uuid.UUID(bytes=bytes(b)))

# -------- 选择使用 uuid7 或 uuid4 --------
USE_UUID4_AS_FALLBACK = False  # True 则使用 uuid4 代替 uuid7

# -------- 尝试导入标准库 uuid7 --------
try:
    from uuid import uuid7 as _std_uuid7  # Python >= 3.14
    def uuid7():
        if USE_UUID4_AS_FALLBACK:
            return str(uuid.uuid4())
        return str(_std_uuid7())
except ImportError:
    # fallback 自定义实现
    def uuid7():
        if USE_UUID4_AS_FALLBACK:
            return str(uuid.uuid4())
        return _custom_uuid7()

# -------- 额外工具函数 --------
def uuid4():
    """直接生成 uuid4"""
    return str(uuid.uuid4())

# -------- 测试导入 --------
if __name__ == "__main__":
    print("uuid7:", uuid7())
    print("uuid4:", uuid4())