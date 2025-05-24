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
    authorization: str

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
                "timestamp": "2024-03-14T12:00:00Z",
                "authorization": "your-token-here"
            }
        }

class CookieReportInDB(BaseModel):
    id: int
    url: str
    cookies: List[Dict]
    timestamp: datetime
    client_ip: str
    token: str
    is_valid_token: bool

    class Config:
        from_attributes = True 