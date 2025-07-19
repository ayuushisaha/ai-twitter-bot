from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List
from uuid import uuid4
from datetime import datetime, timedelta
import os
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage

load_dotenv()

app = FastAPI()
security = HTTPBearer()

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5173",
        "https://ai-twitter-bot.pages.dev",
        "https://ai-twitter-bot-ayu.onrender.com",
        "https://twitter-clone-ui.pages.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

API_KEYS = {}
USER_TOKENS = {}
TWITTER_CLONE_API_KEY = os.getenv("TWITTER_CLONE_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    if token == TWITTER_CLONE_API_KEY:
        return "public_user"
    if token not in API_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return API_KEYS[token]


def get_db():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@app.on_event("startup")
def startup():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tweets (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    posted BOOLEAN DEFAULT FALSE,
                    likes INTEGER DEFAULT 0,
                    retweets INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0
                );
            """)

# Rate Limiting
RATE_LIMIT = 15
RATE_WINDOW = 60
rate_data = {}

def check_rate_limit(ip: str):
    now = datetime.now()
    if ip not in rate_data or now - rate_data[ip]["start"] > timedelta(seconds=RATE_WINDOW):
        rate_data[ip] = {"count": 1, "start": now}
        return True
    if rate_data[ip]["count"] >= RATE_LIMIT:
        return False
    rate_data[ip]["count"] += 1
    return True

# LLM Setup
llm = ChatOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    model="mistralai/mixtral-8x7b-instruct",
    temperature=0.8,
)

prompt_template = PromptTemplate.from_template(
    """You are an expert tweet generator. Write a creative, engaging tweet on: "{topic}"
- Keep it under 280 characters
- Add 1-2 relevant hashtags
- Make it interesting, witty, or informative
Only return the tweet text."""
)

# Models
class Tweet(BaseModel):
    id: str
    username: str
    content: str
    timestamp: str
    posted: bool
    likes: int
    retweets: int
    comments: int

class TweetCreate(BaseModel):
    content: str
    posted: bool = False

class PostPayload(BaseModel):
    content: str
    posted: bool = True

class GenerateRequest(BaseModel):
    topic: str

class User(BaseModel):
    username: str
    password: str


@app.post("/generate")
def generate(data: GenerateRequest, request: Request, user: str = Depends(get_current_user)):
    if not check_rate_limit(request.client.host):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    try:
        prompt = prompt_template.format(topic=data.topic)
        result = llm.invoke(prompt)
        tweet = result.content.strip() if isinstance(result, AIMessage) else str(result)
        return {"content": tweet}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")


@app.post("/direct-post")
def direct_post(payload: PostPayload, user: str = Depends(get_current_user)):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                tid = str(uuid4())
                now = datetime.utcnow().isoformat()
                cur.execute("""
                    INSERT INTO tweets (id, username, content, timestamp, posted)
                    VALUES (%s, %s, %s, %s, %s)
                """, (tid, user, payload.content, now, payload.posted))
                return {
                    "tweet": {
                        "id": tid,
                        "username": user,
                        "content": payload.content,
                        "timestamp": now,
                        "posted": payload.posted,
                        "likes": 0,
                        "retweets": 0,
                        "comments": 0
                    }
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-draft")
def save_draft(data: TweetCreate, user: str = Depends(get_current_user)):
    with get_db() as conn:
        with conn.cursor() as cur:
            tid = str(uuid4())
            now = datetime.utcnow().isoformat()
            cur.execute("""
                INSERT INTO tweets (id, username, content, timestamp, posted)
                VALUES (%s, %s, %s, %s, %s)
            """, (tid, user, data.content, now, data.posted))
            return {"status": "saved", "id": tid}


@app.get("/tweets", response_model=List[Tweet])
def my_tweets(user: str = Depends(get_current_user)):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tweets WHERE username=%s ORDER BY timestamp DESC", (user,))
            return cur.fetchall()


@app.get("/public-tweets")
def get_public_tweets():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tweets WHERE posted=true ORDER BY timestamp DESC")
            return cur.fetchall()


@app.get("/feed", response_model=List[Tweet])
def public_feed():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tweets WHERE posted=true ORDER BY timestamp DESC LIMIT 50")
            return cur.fetchall()


@app.patch("/tweets/{tweet_id}")
def update_tweet(tweet_id: str, update: TweetCreate, user: str = Depends(get_current_user)):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE tweets SET content=%s, posted=%s
                WHERE id=%s AND username=%s
            """, (update.content, update.posted, tweet_id, user))
            return {"status": "updated"}


@app.delete("/tweet/{tweet_id}")
def delete_tweet(tweet_id: str, user: str = Depends(get_current_user)):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tweets WHERE id=%s AND username=%s", (tweet_id, user))
            return {"status": "deleted"}


@app.post("/login")
def login(user: User):
    if user.username in USER_TOKENS:
        token = USER_TOKENS[user.username]
    else:
        token = str(uuid4())[:8]
        API_KEYS[token] = user.username
        USER_TOKENS[user.username] = token
    return {"access_token": token}


@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}


@app.post("/public-post")
def public_post(payload: PostPayload):
    with get_db() as conn:
        with conn.cursor() as cur:
            tid = str(uuid4())
            now = datetime.utcnow().isoformat()
            cur.execute("""
                INSERT INTO tweets (id, username, content, timestamp, posted)
                VALUES (%s, %s, %s, %s, %s)
            """, (tid, "public_user", payload.content, now, True))
            return {
                "tweet": {
                    "id": tid,
                    "username": "public_user",
                    "content": payload.content,
                    "timestamp": now,
                    "posted": True,
                    "likes": 0,
                    "retweets": 0,
                    "comments": 0
                }
            }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
