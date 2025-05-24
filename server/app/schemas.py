from pydantic import BaseModel
from typing import List, Dict
from datetime import datetime

class Cookie(BaseModel):
    name: str
    value: str
    domain: str
    path: str

class CookieReport(BaseModel):
    url: str
    cookies: List[Cookie]
    timestamp: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://example.com",
                "cookies": [
                    {
                        "name": "session",
                        "value": "abc123",
                        "domain": "example.com",
                        "path": "/"
                    }
                ],
                "timestamp": "2024-03-14T12:00:00Z"
            }
        }

class CookieReportInDB(CookieReport):
    id: int

    class Config:
        from_attributes = True 