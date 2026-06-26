from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sqlite3
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "financas.db"


SEED_INCOMES = [
    ("2026-06-05", "Salario", "Trabalho", 5000),
    ("2026-06-12", "Freelance", "Extra", 850),
    ("2026-06-01", "Venda de Produto", "Vendas", 250),
]

SEED_EXPENSES = [
    ("2026-06-03", "Mercado", "Alimentacao", 420),
    ("2026-06-10", "Netflix", "Assinaturas", 39.9),
    ("2026-06-15", "Internet", "Contas", 99.9),
    ("2026-06-18", "Transporte", "Transporte", 150),
]

SEED_BILLS = [
    ("2026-06-15", "Internet", 99, "Pendente"),
    ("2026-06-20", "Energia", 180, "Pendente"),
    ("2026-06-25", "Cartao de Credito", 850, "Pago"),
    ("2026-06-30", "Agua", 75, "Pendente"),
]

SEED_GOALS = [
    ("Viagem", 8000, 3200, "plane"),
    ("Emergencia", 20000, 12000, "shield"),
    ("Casa Propria", 50000, 15500, "home"),
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def setup_database():
    with connect() as conn:
        conn.executescript(
            """
            create table if not exists incomes (
              id integer primary key autoincrement,
              date text not null,
              description text not null,
              category text not null,
              value real not null
            );

            create table if not exists expenses (
              id integer primary key autoincrement,
              date text not null,
              description text not null,
              category text not null,
              value real not null
            );

            create table if not exists bills (
              id integer primary key autoincrement,
              due_date text not null,
              name text not null,
              value real not null,
              status text not null default 'Pendente'
            );

            create table if not exists goals (
              id integer primary key autoincrement,
              name text not null,
              target real not null,
              current real not null default 0,
              icon text not null default 'goal'
            );

            create table if not exists settings (
              id integer primary key check (id = 1),
              name text not null,
              email text not null,
              currency text not null,
              theme text not null
            );
            """
        )

        if conn.execute("select count(*) from incomes").fetchone()[0] == 0:
            conn.executemany(
                "insert into incomes (date, description, category, value) values (?, ?, ?, ?)",
                SEED_INCOMES,
            )
        if conn.execute("select count(*) from expenses").fetchone()[0] == 0:
            conn.executemany(
                "insert into expenses (date, description, category, value) values (?, ?, ?, ?)",
                SEED_EXPENSES,
            )
        if conn.execute("select count(*) from bills").fetchone()[0] == 0:
            conn.executemany(
                "insert into bills (due_date, name, value, status) values (?, ?, ?, ?)",
                SEED_BILLS,
            )
        if conn.execute("select count(*) from goals").fetchone()[0] == 0:
            conn.executemany(
                "insert into goals (name, target, current, icon) values (?, ?, ?, ?)",
                SEED_GOALS,
            )
        conn.execute(
            """
            insert or ignore into settings (id, name, email, currency, theme)
            values (1, 'Joao Silva', 'joaosilva@email.com', 'BRL', 'light')
            """
        )


def rows(conn, table):
    return [dict(row) for row in conn.execute(f"select * from {table} order by id desc")]


def finance_payload():
    with connect() as conn:
        settings = dict(conn.execute("select name, email, currency, theme from settings where id = 1").fetchone())
        return {
            "incomes": rows(conn, "incomes"),
            "expenses": rows(conn, "expenses"),
            "bills": rows(conn, "bills"),
            "goals": rows(conn, "goals"),
            "settings": settings,
        }


def insert_row(table, data):
    allowed = {
        "incomes": ("date", "description", "category", "value"),
        "expenses": ("date", "description", "category", "value"),
        "bills": ("due_date", "name", "value", "status"),
        "goals": ("name", "target", "current", "icon"),
    }
    columns = allowed[table]
    values = [data.get(column) for column in columns]
    if any(value in (None, "") for value in values):
        raise ValueError("Campos obrigatorios faltando")

    placeholders = ", ".join("?" for _ in columns)
    with connect() as conn:
        conn.execute(
            f"insert into {table} ({', '.join(columns)}) values ({placeholders})",
            values,
        )


def delete_row(table, row_id):
    if table not in {"incomes", "expenses", "bills", "goals"}:
        raise ValueError("Tabela invalida")
    with connect() as conn:
        conn.execute(f"delete from {table} where id = ?", (row_id,))


def save_settings(data):
    with connect() as conn:
        conn.execute(
            """
            update settings
               set name = ?, email = ?, currency = ?, theme = ?
             where id = 1
            """,
            (
                data.get("name", "Joao Silva"),
                data.get("email", "joaosilva@email.com"),
                data.get("currency", "BRL"),
                data.get("theme", "light"),
            ),
        )


class FinanceHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/api/finance":
            self.send_json(finance_payload())
            return
        self.send_json({"error": "Rota nao encontrada"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            data = self.read_json()
            if path == "/api/settings":
                save_settings(data)
            elif path in {"/api/incomes", "/api/expenses", "/api/bills", "/api/goals"}:
                insert_row(path.rsplit("/", 1)[-1], data)
            else:
                self.send_json({"error": "Rota nao encontrada"}, 404)
                return
            self.send_json(finance_payload(), 201)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception as exc:
            self.send_json({"error": f"Erro interno: {exc}"}, 500)

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "api":
            self.send_json({"error": "Rota nao encontrada"}, 404)
            return
        try:
            delete_row(parts[1], int(parts[2]))
            self.send_json(finance_payload())
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)


if __name__ == "__main__":
    setup_database()
    server = ThreadingHTTPServer(("localhost", 8000), FinanceHandler)
    print("API Python rodando em http://localhost:8000")
    print("Banco SQLite:", DB_PATH)
    server.serve_forever()
