from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from typing import List, Optional
import json
import logging
from fastapi.exceptions import RequestValidationError
import traceback

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Header
from . import models, schemas

# 配置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cookie Reporter API")

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 设置模板
templates = Jinja2Templates(directory="templates")

# 启动时初始化数据库
@app.on_event("startup")
async def startup_event():
    await models.init_db()

security = HTTPBearer()

# 这里可以替换为你的实际 token
VALID_TOKEN = "your-secret-token"

# 捕获 Pydantic 数据验证错误（422）
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_detail = {
        "errors": exc.errors(),
        # "body": exc.body,
        "url": str(request.url),
        # "method": request.method,
        "headers": dict(request.headers)
    }
    logger.error(f"Validation error: {json.dumps(error_detail)}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
    )

# 全局异常处理器
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = {
        "error_type": type(exc).__name__,
        "error_message": str(exc),
        "url": str(request.url),
        "method": request.method,
        "traceback": traceback.format_exc()
    }
    logger.error(f"Unhandled exception: {json.dumps(error_detail, indent=2)}")
    return JSONResponse(
        status_code=500,
        content={"detail": error_detail},
    )

async def verify_token(authorization: str = Header(...)):
    """
    验证逻辑，检查 Bearer token 是否有效
    """
    # if not authorization.startswith("Bearer "):
        # raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = authorization[7:]  # 去掉 "Bearer " 前缀
    if authorization != VALID_TOKEN:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authorization

@app.post("/api/cookies")
async def create_cookie_report(
    report: schemas.CookieReport,
    token: str = Depends(verify_token),
    db: AsyncSession = Depends(models.get_db)
):
    """
    创建新的 Cookie 报告
    需要有效的 Bearer token
    """
    try:
        db_report = models.CookieReport(
            url=report.url,
            cookies=report.cookies,
            timestamp=report.timestamp
        )
        db.add(db_report)
        await db.commit()
        await db.refresh(db_report)
        return db_report
    except Exception as e:
        logger.exception("Error creating cookie report")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cookies", response_model=List[schemas.CookieReportInDB])
async def get_cookie_reports(
    token: str = Depends(verify_token),
    db: AsyncSession = Depends(models.get_db),
    url: Optional[str] = None,
    days: Optional[int] = None
):
    """
    获取 Cookie 报告列表，支持按 URL 和时间范围过滤
    需要有效的 Bearer token
    """
    try:
        query = select(models.CookieReport)
        
        if url:
            query = query.filter(models.CookieReport.url.contains(url))
        
        if days:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            query = query.filter(models.CookieReport.timestamp >= cutoff_date)
        
        query = query.order_by(models.CookieReport.timestamp.desc())
        result = await db.execute(query)
        return result.scalars().all()
    except Exception as e:
        logger.exception("Error retrieving cookie reports")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cookies/{cookie_id}", response_model=schemas.CookieReportInDB)
async def get_cookie_report(
    cookie_id: int,
    db: AsyncSession = Depends(models.get_db)
):
    """
    获取单个 Cookie 报告的详细信息
    """
    try:
        query = select(models.CookieReport).filter(models.CookieReport.id == cookie_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()
        
        if report is None:
            raise HTTPException(status_code=404, detail="Cookie report not found")
        
        return report
    except HTTPException as he:
        raise
    except Exception as e:
        logger.exception("Error retrieving cookie report")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/", response_class=HTMLResponse)
async def home(request: Request, db: AsyncSession = Depends(models.get_db)):
    """
    显示主页，包含最近的 Cookie 报告
    """
    try:
        query = select(models.CookieReport).order_by(
            models.CookieReport.timestamp.desc()
        ).limit(10)
        
        result = await db.execute(query)
        reports = result.scalars().all()
        
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "reports": reports
            }
        )
    except Exception as e:
        logger.exception("Error rendering home page")
        raise HTTPException(status_code=500, detail=str(e)) 