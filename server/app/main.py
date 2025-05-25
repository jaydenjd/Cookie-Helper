from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict
import json
import logging
import os

from . import models, schemas

# 配置日志
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# 设置允许的token
ALLOWED_TOKEN = os.getenv('COOKIE_HELPER_TOKEN', 'your-secret-token')

# 北京时区
BEIJING_TZ = timezone(timedelta(hours=8))

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
        # 如果token无效，返回错误
        if not is_valid_token:
            logger.warning(f"Invalid token attempt from IP: {client_ip}")
            # 仍然记录无效的请求，但返回错误
            try:
                # 插件发送的是UTC时间，需要转换为北京时间
                utc_timestamp = datetime.fromisoformat(raw_data['timestamp'].replace('Z', '+00:00'))
                # 转换为北京时间
                beijing_timestamp = utc_timestamp.astimezone(BEIJING_TZ).replace(tzinfo=None)
                invalid_timestamp = beijing_timestamp
            except ValueError:
                invalid_timestamp = datetime.now()  # 如果时间戳解析失败，使用当前北京时间
            
            db_report = models.CookieReport(
                url=raw_data['url'],
                cookies=raw_data['cookies'],
                timestamp=invalid_timestamp,
                client_ip=client_ip,
                token=token,
                is_valid_token=False
            )
            db.add(db_report)
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid token")

        # 解析时间戳
        try:
            # 插件发送的是UTC时间，需要转换为北京时间
            utc_timestamp = datetime.fromisoformat(raw_data['timestamp'].replace('Z', '+00:00'))
            # 转换为北京时间
            beijing_timestamp = utc_timestamp.astimezone(BEIJING_TZ).replace(tzinfo=None)
            timestamp = beijing_timestamp
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

@app.get("/", response_class=HTMLResponse)
async def home(
    request: Request,
    db: AsyncSession = Depends(models.get_db),
    page: int = 1,
    url: Optional[str] = None,
    days: Optional[str] = None,
    client_ip: Optional[str] = None,
    is_valid_token: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = None
):
    """
    显示主页，包含Cookie报告列表和筛选功能
    """
    try:
        # 构建查询
        query = select(models.CookieReport)
        count_query = select(func.count()).select_from(models.CookieReport)

        # 应用过滤条件
        if url:
            query = query.filter(models.CookieReport.url.contains(url))
            count_query = count_query.filter(models.CookieReport.url.contains(url))
        
        # 处理days参数
        if days and days.strip():
            try:
                days_int = int(days)
                # 使用北京时间计算截止日期
                cutoff_date = datetime.now() - timedelta(days=days_int)
                query = query.filter(models.CookieReport.timestamp >= cutoff_date)
                count_query = count_query.filter(models.CookieReport.timestamp >= cutoff_date)
            except ValueError:
                pass  # 忽略无效的天数格式
            
        if is_valid_token is not None and is_valid_token.strip():
            is_valid = is_valid_token.lower() == 'true' if isinstance(is_valid_token, str) else bool(is_valid_token)
            query = query.filter(models.CookieReport.is_valid_token == is_valid)
            count_query = count_query.filter(models.CookieReport.is_valid_token == is_valid)
            
        if client_ip:
            query = query.filter(models.CookieReport.client_ip.contains(client_ip))
            count_query = count_query.filter(models.CookieReport.client_ip.contains(client_ip))
            
        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(models.CookieReport.timestamp >= start_datetime)
                count_query = count_query.filter(models.CookieReport.timestamp >= start_datetime)
            except ValueError:
                pass  # 忽略无效的日期格式
            
        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(models.CookieReport.timestamp <= end_datetime)
                count_query = count_query.filter(models.CookieReport.timestamp <= end_datetime)
            except ValueError:
                pass  # 忽略无效的日期格式

        # 获取总记录数
        total_count = await db.scalar(count_query)
        if total_count is None:
            total_count = 0
        
        # 计算分页
        per_page = 20
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        page = min(max(1, page), total_pages)
        
        # 应用排序
        if sort_by and hasattr(models.CookieReport, sort_by):
            sort_column = getattr(models.CookieReport, sort_by)
            if sort_order == 'asc':
                query = query.order_by(sort_column.asc())
            else:
                query = query.order_by(sort_column.desc())
        else:
            # 默认按时间戳降序排序
            query = query.order_by(models.CookieReport.timestamp.desc())
        
        # 应用分页
        query = query.offset((page - 1) * per_page).limit(per_page)
        
        # 执行查询
        result = await db.execute(query)
        reports = result.scalars().all()
        
        return templates.TemplateResponse(
            "index.html",
            {
                "request": request,
                "reports": reports,
                "pagination": {
                    "current_page": page,
                    "total_pages": total_pages,
                    "total": total_count,
                    "has_prev": page > 1,
                    "has_next": page < total_pages
                },
                "filters": {
                    "url": url,
                    "days": int(days) if days and days.strip() and days.isdigit() else None,
                    "client_ip": client_ip,
                    "is_valid_token": is_valid_token,
                    "start_date": start_date,
                    "end_date": end_date,
                    "sort_by": sort_by,
                    "sort_order": sort_order or 'desc'
                }
            }
        )
    except Exception as e:
        logger.exception("Error rendering home page")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cookies")
async def get_cookie_reports(
    request: Request,
    db: AsyncSession = Depends(models.get_db),
    url: Optional[str] = None,
    days: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    is_valid_token: Optional[str] = None,
    client_ip: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    export: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = None
):
    """
    获取 Cookie 报告列表，支持按多个条件过滤
    """
    try:
        query = select(models.CookieReport)
        
        # 应用过滤条件
        if url:
            query = query.filter(models.CookieReport.url.contains(url))
        
        # 处理days参数
        if days and days.strip():
            try:
                days_int = int(days)
                # 使用北京时间计算截止日期
                cutoff_date = datetime.now() - timedelta(days=days_int)
                query = query.filter(models.CookieReport.timestamp >= cutoff_date)
            except ValueError:
                pass  # 忽略无效的天数格式
            
        # 处理is_valid_token参数
        if is_valid_token is not None and is_valid_token.strip():
            is_valid = is_valid_token.lower() == 'true'
            query = query.filter(models.CookieReport.is_valid_token == is_valid)
            
        if client_ip:
            query = query.filter(models.CookieReport.client_ip.contains(client_ip))
            
        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                query = query.filter(models.CookieReport.timestamp >= start_datetime)
            except ValueError:
                pass  # 忽略无效的日期格式
            
        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                query = query.filter(models.CookieReport.timestamp <= end_datetime)
            except ValueError:
                pass  # 忽略无效的日期格式
        
        # 计算总记录数
        count_query = select(func.count()).select_from(models.CookieReport)
        # 应用相同的过滤条件到计数查询
        if url:
            count_query = count_query.filter(models.CookieReport.url.contains(url))
        if days and days.strip():
            try:
                days_int = int(days)
                cutoff_date = datetime.now() - timedelta(days=days_int)
                count_query = count_query.filter(models.CookieReport.timestamp >= cutoff_date)
            except ValueError:
                pass
        if is_valid_token is not None and is_valid_token.strip():
            is_valid = is_valid_token.lower() == 'true'
            count_query = count_query.filter(models.CookieReport.is_valid_token == is_valid)
        if client_ip:
            count_query = count_query.filter(models.CookieReport.client_ip.contains(client_ip))
        if start_date:
            try:
                start_datetime = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                count_query = count_query.filter(models.CookieReport.timestamp >= start_datetime)
            except ValueError:
                pass
        if end_date:
            try:
                end_datetime = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                count_query = count_query.filter(models.CookieReport.timestamp <= end_datetime)
            except ValueError:
                pass
        
        total_count = await db.scalar(count_query)
        
        # 应用排序
        if sort_by and hasattr(models.CookieReport, sort_by):
            sort_column = getattr(models.CookieReport, sort_by)
            if sort_order == 'asc':
                query = query.order_by(sort_column.asc())
            else:
                query = query.order_by(sort_column.desc())
        else:
            # 默认按时间戳降序排序
            query = query.order_by(models.CookieReport.timestamp.desc())
        
        # 如果是导出请求，不应用分页
        if export == 'true':
            # 导出所有数据，不分页
            result = await db.execute(query)
            reports = result.scalars().all()
            
            # 转换为JSON格式并返回
            export_data = []
            for report in reports:
                export_data.append({
                    "id": report.id,
                    "url": report.url,
                    "cookies": report.cookies,
                    "timestamp": report.timestamp.isoformat(),
                    "client_ip": report.client_ip,
                    "token": report.token,
                    "is_valid_token": report.is_valid_token
                })
            
            return JSONResponse(content=export_data)
        else:
            # 正常分页查询
            query = query.offset((page - 1) * per_page).limit(per_page)
            result = await db.execute(query)
            reports = result.scalars().all()
            
            # 计算总页数
            total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
            
            # 返回分页数据
            response_data = {
                "records": [],
                "pagination": {
                    "current_page": page,
                    "total_pages": total_pages,
                    "total": total_count,
                    "has_prev": page > 1,
                    "has_next": page < total_pages
                }
            }
            
            for report in reports:
                response_data["records"].append({
                    "id": report.id,
                    "url": report.url,
                    "cookies": report.cookies,
                    "timestamp": report.timestamp.isoformat(),
                    "client_ip": report.client_ip,
                    "token": report.token,
                    "is_valid_token": report.is_valid_token
                })
            
            return JSONResponse(content=response_data)
            
    except Exception as e:
        logger.exception("Error retrieving cookie reports")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cookies/{cookie_id}")
async def get_cookie_report(
    cookie_id: int,
    request: Request,
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
        
        # 返回JSON格式的数据
        return JSONResponse(content={
            "id": report.id,
            "url": report.url,
            "cookies": report.cookies,
            "timestamp": report.timestamp.isoformat(),
            "client_ip": report.client_ip,
            "token": report.token,
            "is_valid_token": report.is_valid_token
        })
    except HTTPException as he:
        raise
    except Exception as e:
        logger.exception(f"Error retrieving cookie report {cookie_id}")
        raise HTTPException(status_code=500, detail=str(e)) 