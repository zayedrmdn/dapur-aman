from fastapi import FastAPI

app = FastAPI(title="Dapur Aman API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
