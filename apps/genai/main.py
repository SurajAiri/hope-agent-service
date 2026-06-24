from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(
    title="AaaS GenAI Core",
    description="Core AI services for agents.",
    version="0.0.1",
)


class GenerateTextRequest(BaseModel):
    prompt: str
    max_tokens: int = 150


@app.get("/health")
async def health():
    return {"status": "ok", "service": "genai-core"}


@app.post("/generate-text")
async def generate_text(req: GenerateTextRequest):
    # Placeholder for actual model inference
    return {
        "text": f"Generated response for prompt: '{req.prompt}' (simulated)",
        "tokens_used": len(req.prompt.split()) + req.max_tokens,
    }


def main():
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
