"""
AES-256-GCM 加密解密工具

使用 cryptography 库实现 AES-256-GCM 加密算法
用于加密存储用户的 API Key
"""
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from appinit import API_KEY_ENCRYPTION_KEY


def encrypt_api_key(plaintext: str) -> tuple[bytes, bytes, bytes]:
    """使用 AES-256-GCM 加密明文 API Key
    
    Args:
        plaintext: 明文 API Key
        
    Returns:
        tuple: (encrypted_key, iv, tag)
            - encrypted_key: 加密后的密文（包含 tag）
            - iv: 加密用的初始化向量（12 字节）
            - tag: GCM 认证标签（16 字节）
    """
    # 使用 API_KEY_ENCRYPTION_KEY 作为密钥（已经是 32 字节）
    key = API_KEY_ENCRYPTION_KEY
    
    # 生成随机的 IV（12 字节是 GCM 推荐的大小）
    iv = os.urandom(12)
    
    # 创建 AESGCM 实例
    aesgcm = AESGCM(key)
    
    # 加密数据
    # encrypt 返回的是密文 + tag 的组合
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    
    # 分离密文和 tag（tag 在最后 16 字节）
    ciphertext = ciphertext_with_tag[:-16]
    tag = ciphertext_with_tag[-16:]
    
    return ciphertext, iv, tag


def decrypt_api_key(encrypted_key: bytes, iv: bytes, tag: bytes) -> str:
    """使用 AES-256-GCM 解密 API Key
    
    Args:
        encrypted_key: 加密后的密文
        iv: 加密用的初始化向量
        tag: GCM 认证标签
        
    Returns:
        str: 解密后的明文 API Key
        
    Raises:
        cryptography.exceptions.InvalidTag: 如果解密失败（tag 验证不通过）
    """
    # 使用 API_KEY_ENCRYPTION_KEY 作为密钥
    key = API_KEY_ENCRYPTION_KEY
    
    # 创建 AESGCM 实例
    aesgcm = AESGCM(key)
    
    # 重组密文和 tag
    ciphertext_with_tag = encrypted_key + tag
    
    # 解密数据
    plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, None)
    
    return plaintext.decode('utf-8')