import httpx
import asyncio

async def main():
    try:
        r = httpx.get("http://localhost:5000/api/ai/sync")
        print(r.json()["cameras"])
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
