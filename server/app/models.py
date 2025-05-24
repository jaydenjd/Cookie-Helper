from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

Base = declarative_base()

class CookieReport(Base):
    __tablename__ = "cookie_reports"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, index=True)
    cookies = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)
    client_ip = Column(String, index=True)
    token = Column(String)
    is_valid_token = Column(Boolean, default=False)

# 创建异步数据库引擎
DATABASE_URL = "sqlite+aiosqlite:///cookie_reports.db"
engine = create_async_engine(DATABASE_URL, echo=True)

# 创建异步会话工厂
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# 创建数据库表
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

# 获取数据库会话的依赖函数
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close() 