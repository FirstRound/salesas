import os
import json
import psycopg2
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://gen_user:dEK(v8V3$^*CJ8@201.34.142.178:5432/default_db")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("CREATE TABLE IF NOT EXISTS platform_state (id SERIAL PRIMARY KEY, state_json TEXT)")
        conn.commit()
        c.close()
        conn.close()
        print("БД инициализирована.")
    except Exception as e:
        print("Ошибка БД:", e)

init_db()

class StateUpdate(BaseModel):
    tableData: dict
    scenarios: list
    sorts: list = []

@app.get("/")
def serve_frontend():
    if os.path.exists("index.html"):
        with open("index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"error": "Файл index.html не найден"}

@app.get("/app.js")
def serve_js():
    if os.path.exists("app.js"):
        return FileResponse("app.js")
    return {"error": "Файл app.js не найден"}

@app.get("/api/v1/scenarios")
def get_state():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT state_json FROM platform_state ORDER BY id DESC LIMIT 1")
        row = c.fetchone()
        c.close()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        print("Ошибка чтения:", e)
    return {"tableData": {}, "scenarios": []}

@app.get("/admin")
def serve_admin():
    if os.path.exists("admin.html"):
        with open("admin.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"error": "Файл admin.html не найден"}

@app.post("/api/v1/scenarios/update")
def update_state(update: StateUpdate):
    try:
        conn = get_db_connection()
        c = conn.cursor()
        
        # Безопасное получение словаря (работает и на старых, и на новых версиях FastAPI)
        data_dict = update.model_dump() if hasattr(update, 'model_dump') else update.dict()
        json_str = json.dumps(data_dict)
        
        c.execute("INSERT INTO platform_state (state_json) VALUES (%s)", (json_str,))
        conn.commit()
        
        c.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        print("Ошибка записи:", e)
        return {"status": "error", "message": str(e)}
