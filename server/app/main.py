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
import os

from . import models, schemas

# 配置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 设置允许的token
ALLOWED_TOKEN = os.getenv('COOKIE_HELPER_TOKEN', 'your-secret-token')

app = FastAPI(title="Cookie Reporter API")

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

# 设置模板
templates = Jinja2Templates(directory="templates")

# 启动时初始化数据库
@app.on_event("startup")
async def startup_event():
    await models.init_db()

@app.post("/api/cookies")
async def create_cookie_report(
    request: Request,
    db: AsyncSession = Depends(models.get_db)
):
    """
    接收并存储 Cookie 报告
    """
    try:
        # 获取客户端IP
        client_ip = request.client.host
        if request.headers.get('X-Forwarded-For'):
            client_ip = request.headers['X-Forwarded-For'].split(',')[0]

        # 读取原始请求数据
        raw_data = await request.json()
        logger.debug(f"Received raw data: {raw_data}")

        # 验证数据格式
        if not isinstance(raw_data, dict):
            raise HTTPException(status_code=400, detail="Invalid request format")

        # 确保必要的字段存在
        required_fields = ['url', 'cookies', 'timestamp', 'authorization']
        for field in required_fields:
            if field not in raw_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

        # 验证token
        token = raw_data.get('authorization', '')
        is_valid_token = token == ALLOWED_TOKEN
        print('哈哈哈哈哈来查询了')
        # 如果token无效，返回错误
        if not is_valid_token:
            logger.warning(f"Invalid token attempt from IP: {client_ip}")
            # 仍然记录无效的请求，但返回错误
            db_report = models.CookieReport(
                url=raw_data['url'],
                cookies=raw_data['cookies'],
                timestamp=datetime.fromisoformat(raw_data['timestamp'].replace('Z', '+00:00')),
                client_ip=client_ip,
                token=token,
                is_valid_token=False
            )
            db.add(db_report)
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid token")

        # 解析时间戳
        try:
            timestamp = datetime.fromisoformat(raw_data['timestamp'].replace('Z', '+00:00'))
        except ValueError as e:
            logger.error(f"Error parsing timestamp: {e}")
            raise HTTPException(status_code=400, detail="Invalid timestamp format")

        # 创建数据库记录
        db_report = models.CookieReport(
            url=raw_data['url'],
            cookies=raw_data['cookies'],
            timestamp=timestamp,
            client_ip=client_ip,
            token=token,
            is_valid_token=True
        )
        
        logger.debug(f"Creating database record: {db_report.__dict__}")
        
        db.add(db_report)
        await db.commit()
        await db.refresh(db_report)
        
        logger.info(f"Successfully saved cookie report for URL: {raw_data['url']} from IP: {client_ip}")
        
        return JSONResponse(content={
            "id": db_report.id,
            "url": db_report.url,
            "cookies": db_report.cookies,
            "timestamp": db_report.timestamp.isoformat(),
            "client_ip": db_report.client_ip,
            "is_valid_token": db_report.is_valid_token
        })

    except HTTPException as he:
        logger.error(f"HTTP Exception: {he.detail}")
        raise
    except Exception as e:
        logger.exception("Error processing cookie report")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cookies", response_model=List[schemas.CookieReportInDB])
async def get_cookie_reports(
    request: Request,
    db: AsyncSession = Depends(models.get_db),
    url: Optional[str] = None,
    days: Optional[int] = None
):
    """
    获取 Cookie 报告列表，支持按 URL 和时间范围过滤
    """
    try:
        # 验证请求中的token
        # token = request.headers.get('Authorization')
        # if not token or token != ALLOWED_TOKEN:
            # raise HTTPException(status_code=401, detail="Invalid token")

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
    request: Request,
    db: AsyncSession = Depends(models.get_db)
):
    """
    获取单个 Cookie 报告的详细信息
    """
    try:
        # 验证请求中的token
        # token = request.headers.get('Authorization')
        # if not token or token != ALLOWED_TOKEN:
            # raise HTTPException(status_code=401, detail="Invalid token")

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
        # 验证请求中的token
        # token = request.headers.get('Authorization')
        # if not token or token != ALLOWED_TOKEN:
            # raise HTTPException(status_code=401, detail="Invalid token")

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