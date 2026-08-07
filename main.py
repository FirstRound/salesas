from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Используем путь к БД, который можно переопределить через переменные окружения
DB_PATH = os.getenv("DB_PATH", "agronom_sales.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS platform_state (id INTEGER PRIMARY KEY, state_json TEXT)''')
    conn.commit()
    conn.close()

init_db()

class StateUpdate(BaseModel):
    tableData: dict
    scenarios: list

# 1. Отдаем наш интерфейс при заходе на главную страницу
@app.get("/")
def serve_frontend():
    with open("index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# 2. API для получения состояния
@app.get("/api/v1/scenarios")
def get_state():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT state_json FROM platform_state ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    
    if row:
        return json.loads(row[0])
    return {"tableData": {}, "scenarios": []}

# 3. API для сохранения состояния
@app.post("/api/v1/scenarios/update")
def save_state(state: StateUpdate):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO platform_state (state_json) VALUES (?)", (json.dumps(state.model_dump()),))
    conn.commit()
    conn.close()
    return {"status": "success"}