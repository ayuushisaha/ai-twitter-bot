import os
import random
import time
from datetime import datetime
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, root_validator
import httpx # Essential for communicating with the external Twitter Clone API

# LangChain for AI generation (using simulated responses)
from langchain_core.runnables import RunnableLambda
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# --- Load Environment Variables ---
load_dotenv()

# --- FastAPI App Initialization ---
app = FastAPI(
    title="AI Twitter Clone Backend Proxy",
    description="Backend to proxy calls to external Twitter Clone API and provide AI tweet generation.",
    version="1.0.0"
)

# --- CORS Configuration ---
origins = [
    "http://localhost",
    "http://localhost:5173", # Your Solid.js frontend's default development URL
    "http://localhost:5174", # Another common Vite development port
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class PostTweetRequest(BaseModel):
    content: str = Field(min_length=1, max_length=280)

class TweetResponse(BaseModel):
    username: str
    text: str
    timestamp: str # Expecting string from external API, will parse for sorting
    likes: int = 0
    retweets: int = 0
    id: int | None = None

    @root_validator(pre=True)
    def set_text_from_content(cls, values):
        # This validator ensures 'text' is populated from 'content' if 'text' is missing
        if 'text' not in values and 'content' in values:
            values['text'] = values['content']
        # Fallback if neither 'text' nor 'content' is present
        if 'text' not in values:
            values['text'] = 'No content provided'
        return values


class MessageResponse(BaseModel):
    message: str
    tweet_id: str | None = None

# CRITICAL FIX: BaseBaseModel -> BaseModel (already done in previous step, confirming it's here)
class AIdeaResponse(BaseModel):
    idea: str

# --- AI Configuration (Simulated Only) ---
SIMULATED_AI_TWEET_IDEAS = [
    "Exploring the latest in web development. What new tech are you excited about? #WebDev #Tech",
    "Just finished a great book on [topic]! Highly recommend it. � #Reading",
    "The future of AI is fascinating. What ethical considerations should we prioritize?",
    "Enjoying a productive coding session. What's your secret to staying focused? #CodingLife",
    "Coffee break! ☕ What's your go-to beverage for creative thinking?",
    "Thinking about community building on social media. Any tips for engaging followers?",
    "If you could automate one daily task with AI, what would it be? #AI #Automation",
    "Beautiful day for learning! What new skill are you picking up? #LifelongLearning",
    "Reflecting on personal growth this year. What's one challenge you've overcome recently?",
    "Dreaming of new features for the AI Agent. What would make it even more helpful?",
]

async def get_ai_generated_tweet(topic: str) -> str:
    print(f"Backend: Using simulated AI generation for topic: '{topic}'")
    time.sleep(random.uniform(0.8, 2.5))
    return random.choice(SIMULATED_AI_TWEET_IDEAS)

ai_tweet_generation_chain = (
    ChatPromptTemplate.from_template("Generate a short, engaging tweet about: {topic}")
    | RunnableLambda(get_ai_generated_tweet)
    | StrOutputParser()
)

# --- External Twitter Clone API Configuration ---
EXTERNAL_TWITTER_CLONE_BASE_URL = "https://twitterclone-server-2xz2.onrender.com"
TWITTER_CLONE_API_KEY = os.getenv("TWITTER_CLONE_API_KEY", "")
# This username ('ayushi') is used for filtering posts and setting the username when posting
EXTERNAL_TWITTER_USERNAME = TWITTER_CLONE_API_KEY.split('_')[0] if TWITTER_CLONE_API_KEY else "ayushi"

# --- API Endpoints ---

@app.post("/proxy-post-tweet", response_model=MessageResponse, status_code=201)
async def proxy_post_tweet(request_data: PostTweetRequest):
    """
    Proxies a tweet posting request from the frontend to the external Twitter Clone API.
    """
    if not TWITTER_CLONE_API_KEY:
        raise HTTPException(status_code=500, detail="Backend: TWITTER_CLONE_API_KEY not configured in environment variables.")

    async with httpx.AsyncClient() as client:
        try:
            external_payload = {
                "username": EXTERNAL_TWITTER_USERNAME,
                "text": request_data.content
            }
            res = await client.post(
                f"{EXTERNAL_TWITTER_CLONE_BASE_URL}/post_tweet",
                headers={"api-key": TWITTER_CLONE_API_KEY, "Content-Type": "application/json"},
                json=external_payload
            )
            res.raise_for_status()
            external_data = res.json()
            tweet_id_str = str(external_data.get("tweet_id")) if external_data.get("tweet_id") is not None else None
            print(f"Backend: Successfully proxied tweet. External API response: {external_data}")
            return {"message": external_data.get("message", "Tweet proxied successfully!"), "tweet_id": tweet_id_str}
        except httpx.HTTPStatusError as e:
            print(f"Backend: HTTP error proxying tweet: {e.response.status_code} - {e.response.text}")
            raise HTTPException(status_code=e.response.status_code, detail=f"External API error: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Backend: Network error proxying tweet: {e}")
            raise HTTPException(status_code=503, detail=f"Failed to connect to external tweet service: {e}")
        except Exception as e:
            print(f"Backend: Unexpected error proxying tweet: {e}")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@app.get("/generate-tweet", response_model=AIdeaResponse)
async def generate_tweet_idea():
    """
    Triggers AI to generate a tweet idea (uses simulated responses).
    """
    generated_idea = await ai_tweet_generation_chain.ainvoke({"topic": "a general tweet idea"})
    return {"idea": generated_idea}

@app.get("/tweets", response_model=list[TweetResponse])
async def get_user_tweets():
    """
    Fetches ALL tweets from the external Twitter Clone API and filters them by the configured username.
    """
    print("Backend: Received request for user tweets.")
    if not TWITTER_CLONE_API_KEY:
        raise HTTPException(status_code=500, detail="Backend: TWITTER_CLONE_API_KEY not configured in environment variables.")

    async with httpx.AsyncClient() as client:
        try:
            print(f"Backend: Attempting to fetch all tweets from {EXTERNAL_TWITTER_CLONE_BASE_URL}/tweets")
            res = await client.get(
                f"{EXTERNAL_TWITTER_CLONE_BASE_URL}/tweets",
                headers={"api-key": TWITTER_CLONE_API_KEY}
            )
            res.raise_for_status()
            raw_external_response = res.json()

            all_external_tweets = raw_external_response.get('data', [])
            
            if not isinstance(all_external_tweets, list):
                print(f"Backend: After extracting 'data', expected list but received type: {type(all_external_tweets).__name__}. Proceeding with empty list.")
                all_external_tweets = []
            
            print(f"Backend: Successfully fetched {len(all_external_tweets)} tweets from external API's 'data' field.")
            print(f"Backend: Filtering for username: '{EXTERNAL_TWITTER_USERNAME}' (from API Key: '{TWITTER_CLONE_API_KEY}')")

            filtered_tweets_for_frontend = []
            for tweet_data in all_external_tweets:
                if not isinstance(tweet_data, dict):
                    print(f"Backend: Warning: Skipping malformed tweet data (not a dictionary): {tweet_data}")
                    continue

                # print(f"Backend: Checking tweet from '{tweet_data.get('username')}' against target '{EXTERNAL_TWITTER_USERNAME}'. Content: '{tweet_data.get('content')}'")
                
                if tweet_data.get("username") == EXTERNAL_TWITTER_USERNAME:
                    try:
                        # Pass the entire tweet_data dictionary. The @root_validator in TweetResponse will handle text/content.
                        parsed_tweet = TweetResponse(**tweet_data)
                        filtered_tweets_for_frontend.append(parsed_tweet.model_dump())
                    except ValidationError as ve:
                        print(f"Backend: Validation Error parsing filtered tweet: {tweet_data} - {ve.errors()}")
                    except Exception as parse_e:
                        print(f"Backend: General Error parsing filtered tweet: {tweet_data} - {parse_e}")
                # else:
                    # print(f"Backend: Skipping tweet from non-matching user: {tweet_data.get('username')}")
            
            print(f"Backend: Found {len(filtered_tweets_for_frontend)} tweets for '{EXTERNAL_TWITTER_USERNAME}' after filtering and parsing.")

            filtered_tweets_for_frontend.sort(key=lambda t: (
                datetime.fromisoformat(t['timestamp'].replace('Z', '+00:00'))
                if isinstance(t.get('timestamp'), str)
                else datetime.min
            ), reverse=True)


            return filtered_tweets_for_frontend
        except httpx.HTTPStatusError as e:
            print(f"Backend: HTTP error fetching external tweets: {e.response.status_code} - {e.response.text}")
            raise HTTPException(status_code=e.response.status_code, detail=f"External API error: {e.response.text}")
        except httpx.RequestError as e:
            print(f"Backend: Network error fetching external tweets: {e}")
            raise HTTPException(status_code=503, detail=f"Failed to connect to external tweet service: {e}")
        except Exception as e:
            print(f"Backend: Unexpected error fetching external tweets: {e}")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
