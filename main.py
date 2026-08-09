from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
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

# --- НАСТРОЙКА БАЗЫ ДАННЫХ ---
# Вставьте сюда вашу строку подключения из панели Timeweb
# ВАЖНО: Убедитесь, что она начинается с postgresql:// (если там postgres:// - допишите ql)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://gen_user:dEK(v8V3$^*CJ8@201.34.142.178:5432/default_db")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    try:
        conn = get_db_connection()
        c = conn.cursor()
        # В PostgreSQL для автоувеличения ID используется SERIAL
        c.execute('''CREATE TABLE IF NOT EXISTS platform_state (id SERIAL PRIMARY KEY, state_json TEXT)''')
        conn.commit()
        c.close()
        conn.close()
        print("База данных успешно инициализирована.")
    except Exception as e:
        print("Ошибка при подключении к БД:", e)

# Инициализируем таблицу при старте
init_db()

class StateUpdate(BaseModel):
    tableData: dict
    scenarios: list
    sorts: list = []

# 1. Отдаем наш интерфейс при заходе на главную страницу
@app.get("/")
def serve_frontend():
    with open("index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# 2. API для получения состояния
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
        print("Ошибка при чтении из БД:", e)
        
    return {"tableData": {}, "scenarios": []}

# 3. API для сохранения состояния
@app.post("/api/v1/scenarios/update")
def update_state(update: StateUpdate):
    try:
        conn = get_db_connection()
        c = conn.cursor()
        # В PostgreSQL вместо знака вопроса (?) используется %s
        c.execute("INSERT INTO platform_state (state_json) VALUES (%s)", (json.dumps(update.model_dump()),))
        conn.commit()
        c.close()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        print("Ошибка при записи в БД:", e)
        return {"status": "error", "message": str(e)}
