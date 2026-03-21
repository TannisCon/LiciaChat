"""
应用初始化模块 - 提供配置单例、数据库引擎单例和统一初始化函数
"""
import os
from pathlib import Path
from datetime import datetime
from typing import Any, Optional

import yaml
import sqlite3
from sqlmodel import SQLModel, Session, create_engine, Field, select
from sqlalchemy import desc
from dotenv import load_dotenv


# =============================================================================
# 配置单例类
# =============================================================================

class _ConfigSingleton:
    """配置单例类 - 确保 config.yaml 只读取一次"""
    
    _instance: Optional["_ConfigSingleton"] = None
    _config_data: dict = {}
    _initialized: bool = False
    
    # 类级别的配置默认值
    _defaults = {
        # LLM 相关配置
        "main_llm_model": "qwen3.5-plus",
        "lite_llm_model": "qwen3.5-flash",
        "dashscope_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "dashscope_api_key": "",
        
        # 对话历史配置
        "max_recent_rounds": 6,
        "force_dequeue_rounds": 16,
        "compress_timeout": 60,
        "compress_max_retries": 2,
        
        # JWT 配置
        "jwt_secret": "change-this-secret-key-in-production",
        "jwt_algorithm": "HS256",
        "jwt_expire_minutes": 30,
        "refresh_token_expire_days": 30,
        
        # 管理员配置
        "admin_email": "admin@example.com",
        
        # 用户注册配置
        "registration_enabled": False,
        
        # API Key 加密配置（AES-256-GCM）
        "api_key_encryption_key": "change-this-encryption-key-in-production",
    }
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def load(self) -> dict:
        """加载配置文件并合并默认值（仅在首次调用时执行）
        
        特殊处理 dashscope_api_key: 优先级为 环境变量 > 配置文件 > 默认值
        """
        if not self._initialized:
            config_path = Path(__file__).parent / "config.yaml"
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    file_config = yaml.safe_load(f) or {}
            except (FileNotFoundError, yaml.YAMLError) as e:
                print(f"警告：配置文件加载失败 ({e})，使用默认配置")
                file_config = {}
            
            # 合并配置：文件配置优先，缺失项使用默认值
            self._config_data = {**self._defaults, **file_config}
            
            # 特殊处理 dashscope_api_key: 环境变量 > 配置文件 > 默认值
            env_api_key = os.environ.get("DASHSCOPE_API_KEY")
            if env_api_key:
                self._config_data["dashscope_api_key"] = env_api_key
            elif "dashscope_api_key" in file_config:
                self._config_data["dashscope_api_key"] = file_config["dashscope_api_key"]
            else:
                self._config_data["dashscope_api_key"] = self._defaults["dashscope_api_key"]
            
            # 处理 api_key_encryption_key: 确保为 32 字节（不足补 0，超过截断）
            encryption_key = self._config_data.get("api_key_encryption_key", self._defaults["api_key_encryption_key"])
            encryption_key_bytes = encryption_key.encode('utf-8')
            if len(encryption_key_bytes) < 32:
                # 不足 32 字节，补 0
                encryption_key_bytes = encryption_key_bytes.ljust(32, b'\x00')
            elif len(encryption_key_bytes) > 32:
                # 超过 32 字节，截断
                encryption_key_bytes = encryption_key_bytes[:32]
            self._config_data["api_key_encryption_key"] = encryption_key_bytes
            
            # 处理 registration_enabled: 确保为有效布尔值
            registration_enabled = self._config_data.get("registration_enabled", self._defaults["registration_enabled"])
            if not isinstance(registration_enabled, bool):
                # 非布尔值，置为 False
                registration_enabled = False
            self._config_data["registration_enabled"] = registration_enabled
            
            self._initialized = True
            
        return self._config_data
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置项"""
        if not self._initialized:
            self.load()
        # 先从加载的配置中查找，找不到则从默认值中查找
        if key in self._config_data:
            return self._config_data[key]
        return self._defaults.get(key, default)
    
    def __getitem__(self, key: str) -> Any:
        """支持字典访问语法 config[key]"""
        if not self._initialized:
            self.load()
        return self._config_data[key]
    
    def __getattr__(self, name: str) -> Any:
        """支持属性访问语法 config.key"""
        if not self._initialized:
            self.load()
        try:
            return self._config_data[name]
        except KeyError:
            raise AttributeError(f"配置中不存在 '{name}'")
        
    def __setattr__(self, name, value):
        """
        设置属性时的拦截方法
        
        注意：
        1. 初始化完成后 (_initialized=True)，禁止直接修改 _config_data 中已存在的配置项
        2. 如需重新加载配置，需手动重置 _initialized = False 后调用 load()
        3. 以 '_' 开头的内部属性（如 _instance, _config_data, _initialized）不受此限制
        """
        if self._initialized and name in self._config_data:
            raise AttributeError(f"不能直接修改全局配置项 '{name}'，请手动重置 _initialized 后调用 load() 更新，或者闲的蛋疼再写一个reload()方法来实现这个功能，或者用本地变量进行单独配置")
        super().__setattr__(name, value)

# 加载环境变量（如果有 .env 文件）
loadEnvFile = load_dotenv()
print("从 .env 文件加载环境变量:", loadEnvFile)


# 全局配置单例实例
config = _ConfigSingleton()

# 立即初始化配置，确保后续引用时有正确初值
_config_data = config.load()


# =============================================================================
# 数据库引擎单例
# =============================================================================

# 数据库路径
DB_PATH = Path(__file__).resolve().parent / "database.db"

# 全局数据库引擎 - 确保只创建一次
_engine: Optional[Any] = None


def get_engine():
    """获取数据库引擎单例"""
    global _engine
    if _engine is None:
        _engine = create_engine(
            f"sqlite:///{DB_PATH}",
            echo=False,
            connect_args={"check_same_thread": False
                          }
            
            # SQLite 连接池配置
            # pool_size=10,
            # max_overflow=20,
            # pool_pre_ping=True  # 连接前检查有效性
        )
    return _engine


# 全局 Session 工厂
SessionLocal = Session


# =============================================================================
# 导出的配置常量（从已初始化的配置中获取）
# 确保直接引用时就有正确的默认值
# =============================================================================

# LLM 相关配置 - 直接从 config_data 读取，该值已经过处理
MAIN_LLM_MODEL: str = _config_data["main_llm_model"]
LITE_LLM_MODEL: str = _config_data["lite_llm_model"]
DASHSCOPE_BASE_URL: str = _config_data["dashscope_base_url"]
DASHSCOPE_API_KEY: str = _config_data["dashscope_api_key"]  # 已在 load() 中处理优先级

# 对话历史配置
MAX_RECENT_ROUNDS: int = _config_data["max_recent_rounds"]
FORCE_DEQUEUE_ROUNDS: int = _config_data["force_dequeue_rounds"]
COMPRESS_TIMEOUT: int = _config_data["compress_timeout"]
COMPRESS_MAX_RETRIES: int = _config_data["compress_max_retries"]

# JWT 配置
JWT_SECRET: str = _config_data["jwt_secret"]
JWT_ALGORITHM: str = _config_data["jwt_algorithm"]
JWT_EXPIRE_MINUTES: int = _config_data["jwt_expire_minutes"]
REFRESH_TOKEN_EXPIRE_DAYS: int = _config_data["refresh_token_expire_days"]

# 管理员配置
ADMIN_EMAIL: str = _config_data["admin_email"]

# 用户注册配置
REGISTRATION_ENABLED: bool = _config_data["registration_enabled"]

# API Key 加密配置（AES-256-GCM，32 字节）
API_KEY_ENCRYPTION_KEY: bytes = _config_data["api_key_encryption_key"]


# =============================================================================
# 数据库模型
# =============================================================================

class User(SQLModel, table=True):
    """用户表模型"""
    uid: int = Field(default=None, primary_key=True, unique=True, index=True)  # 自增主键，从 10000 开始
    uuid: str = Field(unique=True, index=True) # uuid4 格式的唯一标识符,关联其他表使用
    email: str = Field(unique=True, index=True) # 用户邮箱，唯一且作为登录标识
    username: str # 用户名，<=16字符，可修改，仅用于展示，不作为登录凭证
    password_hash: str # 密码哈希值，使用 bcrypt 加密存储
    role: str = "user" # 用户角色，默认为 "user"，授信用户为 "trusted"，管理员为 "admin"，除管理员外均为BYOK用户，授信用户可生成用户注册邀请码，后续可根据需要添加更多角色
    created_at: datetime = Field(default_factory=datetime.utcnow) # 账户创建时间(UTC时间)
    private: Optional[str] = Field(default="[]") # 可选的 JSON 字符串，用于存储用户的额外信息
    password_changed_at: Optional[datetime] = Field(default=None) # 密码最后修改时间(UTC时间)


class Chat(SQLModel, table=True):
    """对话表模型"""
    chat_id: str = Field(default=None, primary_key=True, unique=True, index=True) # "chat-" + uuid7 格式的唯一标识符
    uuid: str = Field(foreign_key="user.uuid", index=True) # 关联 users 表的 uuid4
    title: str = "新对话" # 默认标题为 "新对话"，后续通过异步任务更新为生成的标题
    current_model: str = MAIN_LLM_MODEL # 当前对话使用的模型，默认为主模型
    created_at: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp()))
    updated_at: int = Field(default_factory=lambda: int(datetime.utcnow().timestamp()))
    history_recent: Optional[str] = Field(default="[]") # JSON 字符串，存储最近对话轮次的历史记录，格式为 [{"role": "user/assistant", "content": "消息内容"}, ...]
    history_full: Optional[str] = Field(default="[]") # JSON 字符串，存储所有对话轮次的历史记录，格式同 history_recent，但包含完整对话历史
    history_compressed: Optional[str] = Field(default="[]") # JSON 字符串，存储压缩摘要历史
    total_rounds: Optional[int] = Field(default=None) # 对话总轮次，初始为 None，功能待实现
    total_tokens: Optional[int] = Field(default=None) # 对话总 tokens 数，初始为 None，功能待实现


class InviteCode(SQLModel, table=True):
    """邀请码表模型"""
    code: str = Field(default=None, primary_key=True, unique=True, index=True, max_length=12) # 12 字符 Base32 邀请码，主键
    user_id: str = Field(foreign_key="user.uuid", index=True) # 关联 users 表的 uuid，创建该邀请码的用户
    type: str = Field(default="user") # 邀请码类型："user"或"trusted"
    created_at: datetime = Field(default_factory=datetime.utcnow) # 邀请码创建时间 (UTC)
    used_by: str = Field(default="[]") # JSON 字符串，存储使用该邀请码注册的用户 email 列表
    used_at: str = Field(default="[]") # JSON 字符串，存储邀请码被使用的 UTC 时间列表
    uses: int = Field(default=0) # 已使用次数
    max_uses: int = Field(default=1) # 最大使用次数，0 表示无限制
    expires_at: Optional[datetime] = Field(default=None) # 可选的过期时间 (UTC)
    note: Optional[str] = Field(default=None, max_length=255) # 可选的备注，最多 255 字符


class ApiKey(SQLModel, table=True):
    """用户 API Key 表模型"""
    user_id: str = Field(foreign_key="user.uuid", primary_key=True, index=True)  # 主键，关联 users 表的 uuid
    provider: str = Field(default="bailian")  # Key 对应提供商，默认 bailian
    base_url: str  # Key 对应提供商的 base_url
    encrypted_key: bytes  # AES-256-GCM 加密后的密文
    iv: bytes  # AES 的 iv
    tag: bytes  # AES-GCM 的 tag
    updated_at: datetime = Field(default_factory=datetime.utcnow)  # key 创建或更改的 UTC 时间
    status: str = Field(default="pending")  # pending, valid, quota, invalid


# =============================================================================
# 统一初始化函数
# =============================================================================
# 这是一个开发时使用的工具函数, 根据需要可以修改并在 init_database() 中调用它来创建新列, 并确保数据库表结构正确，使用时替换table和new_column为实际需要添加的表名和列名, 例如: new_column TEXT
# 确保 table 表中存在 new_column 列，如果不存在则新增该列
def ensure_new_column(db_path: str, table: str, column: str, column_type: str = "TEXT"):
    """检查并添加缺失的列到指定表
    
    Args:
        db_path: 数据库文件路径
        table: 表名
        column: 列名
        column_type: 列类型，默认 TEXT
    
    用法示例:
        ensure_new_column(str(DB_PATH), "chat", "current_model", "TEXT")
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 获取 table 表所有列名
    cursor.execute(f"PRAGMA table_info({table});")
    columns = [row[1] for row in cursor.fetchall()]

    if column not in columns:
        print(f"{column} 列不存在，新增列...")
        cursor.execute(f'ALTER TABLE {table} ADD COLUMN {column} {column_type};')
        conn.commit()
        print(f"{column} 列创建完成")
    else:
        print(f"{column} 列已存在，无需新增")

    conn.close()
# =============================================================================
def init_database():
    """初始化所有数据库表和默认数据
    位于appinit.py
    - 创建 user 表
    - 创建 chat 表
    - 如果 user 表中无指定的管理员帐户，创建默认管理员账户
    - 包含一个工具函数 ensure_new_column()，用于在开发过程中新增表列时检查并添加缺失的列（需要手动调用并修改表名和列定义）
    """
    import uuid
    import bcrypt
    # from sqlmodel import Session
    
    engine = get_engine()
    
    # 由于Sqlmodel不支持在表中创建新列，如果需要在某表中新增某列，取消注释并修改、调用这个工具函数，直接通过sqlite3连接数据库检查并新增列，确保表结构正确
    # 使用完成后应注释掉这个函数以避免以raw方式拼接并执行数据库命令带来的潜在风险
    ensure_new_column(str(DB_PATH), "chat", "current_model", "TEXT")

    # 一次性创建所有表
    SQLModel.metadata.create_all(engine)
    
    # 检查并创建管理员账户
    with SessionLocal(engine) as session:
        statement = select(User).where(User.email == ADMIN_EMAIL)
        admin_user = session.exec(statement).first()
        
        if admin_user is None:
            # 创建管理员账户
            def hash_password(password: str) -> str:
                salt = bcrypt.gensalt()
                return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
            
            # 邮箱地址转换为小写，确保一致性（邮箱地址不区分大小写）
            admin_email_lower = ADMIN_EMAIL.lower()
            
            admin = User(
                uid=10000,
                uuid=str(uuid.uuid4()),
                email=admin_email_lower,
                username="admin",
                password_hash=hash_password("password"),
                role="admin",
                created_at=datetime.utcnow()
            )
            session.add(admin)
            session.commit()
            print(f"管理员账户已创建：{admin_email_lower} / password")
        else:
            print(f"管理员账户存在：{ADMIN_EMAIL}")
    
    print("LiciaChat 数据库初始化完成")