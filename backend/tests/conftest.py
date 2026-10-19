from copy import deepcopy
from datetime import datetime, timezone
import pytest

USER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"


class Result:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class Query:
    def __init__(self, db, table):
        self.db, self.table_name, self.filters = db, table, []
        self.operation, self.payload = "select", None
        self.columns, self.limit_value, self.order_by = "*", None, None
        self.count_mode, self.head = None, False

    def select(self, columns="*", count=None, head=False):
        self.columns, self.count_mode, self.head = columns, count, head
        return self

    def eq(self, key, value): self.filters.append((key, "eq", value)); return self
    def gte(self, key, value): self.filters.append((key, "gte", value)); return self
    def lte(self, key, value): self.filters.append((key, "lte", value)); return self
    def in_(self, key, values): self.filters.append((key, "in", values)); return self
    def or_(self, expression): self.search = expression.split("%")[-2].strip("%") if "%" in expression else expression; return self
    def order(self, key, desc=False): self.order_by = (key, desc); return self
    def limit(self, value): self.limit_value = value; return self
    def insert(self, payload): self.operation, self.payload = "insert", payload; return self
    def update(self, payload): self.operation, self.payload = "update", payload; return self
    def delete(self): self.operation = "delete"; return self

    def execute(self):
        rows = self.db.tables.setdefault(self.table_name, [])
        matches = [row for row in rows if all(
            (row.get(key) == value if op == "eq" else row.get(key) in value if op == "in" else str(row.get(key, "")) >= value if op == "gte" else str(row.get(key, "")) <= value)
            for key, op, value in self.filters
        )]
        if hasattr(self, "search"):
            needle = self.search.lower()
            matches = [row for row in matches if any(needle in str(value).lower() for key, value in row.items() if key in {"title", "subject", "file_name"})]
        if self.operation == "insert":
            row = {"id": "33333333-3333-4333-8333-333333333333", "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(), **self.payload}
            rows.append(row); matches = [row]
        elif self.operation == "update":
            for row in matches: row.update(self.payload)
        elif self.operation == "delete":
            for row in matches: rows.remove(row)
            return Result(matches)
        if self.order_by:
            key, desc = self.order_by; matches.sort(key=lambda row: row.get(key, ""), reverse=desc)
        if self.limit_value is not None: matches = matches[:self.limit_value]
        selected = matches if self.columns == "*" else [{key: row.get(key) for key in self.columns.split(",")} for row in matches]
        return Result([] if self.head else selected, count=len(matches) if self.count_mode else None)


class StorageBucket:
    def upload(self, path, content, options): return {"path": path}
    def remove(self, paths): return {"data": paths}


class Storage:
    def from_(self, bucket): return StorageBucket()


class FakeDB:
    def __init__(self):
        self.quota = True
        self.tables = {"materials": [
            {"id": "33333333-3333-4333-8333-333333333333", "user_id": USER_ID, "syllabus_id": None, "title": "Aula de Ciências", "content": "## Objetivo\nObservar plantas.", "kind": "plano de aula", "subject": "Ciências", "created_at": "2026-10-01T12:00:00+00:00", "updated_at": "2026-10-01T12:00:00+00:00"},
            {"id": "44444444-4444-4444-8444-444444444444", "user_id": OTHER_ID, "syllabus_id": None, "title": "Privado", "content": "Não deve aparecer", "kind": "resumo", "subject": "História", "created_at": "2026-10-01T12:00:00+00:00", "updated_at": "2026-10-01T12:00:00+00:00"},
        ], "syllabi": [], "profiles": [{"id": USER_ID, "full_name": "Professora Exemplo", "school_name": "Escola Exemplo", "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"}]}
        self.storage = Storage()

    def table(self, name): return Query(self, name)
    def rpc(self, name, args): return type("RPC", (), {"execute": lambda inner: Result(self.quota)})()


@pytest.fixture
def test_context():
    yield FakeDB()
