#!/usr/bin/env python3
"""抽砖模拟器 · 排行榜服务

只用标准库（http.server + sqlite3），不装任何依赖。
监听 127.0.0.1:8787，由 nginx 把 /brick/api/ 反代过来。

接口：
  GET  /api/leaderboard?type=steps|value&limit=10
  POST /api/upload   {nickname, steps, best:{tier,grade,wear,val,cond}}
"""

import json
import os
import re
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "brick.db")
PORT = 8787

# 和 web/data.js 的 TABLE 对齐，别让前端随手编一个皮肤名上来
GRADES = {
    "绿皮": {""},
    "蓝皮": {""},
    "紫皮": {""},
    "主皮肤": {"优品 C", "优品 A", "优品 B", "优品 S",
               "极品 C", "极品 B", "极品 A", "极品 S"},
}

NICK_RE = re.compile(r"^[\w\u4e00-\u9fa5·\-\. ]{1,12}$")
RATE_WINDOW = 3600
RATE_MAX = 30

# 和 web/data.js 的 WEAR_BANDS 一致：磨损落在哪一段，成色就是哪一档
WEAR_BANDS = [(0.40, "S"), (1.25, "A"), (2.50, "B"), (4.00, "C")]


def band_of(wear):
    for hi, g in WEAR_BANDS:
        if wear <= hi:
            return g
    return "C"

_conn = None


def db():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                nickname TEXT    NOT NULL,
                steps    INTEGER NOT NULL,
                tier     TEXT    NOT NULL,
                grade    TEXT    NOT NULL,
                wear     REAL,
                val      INTEGER NOT NULL,
                cond     TEXT,
                ip       TEXT,
                ts       INTEGER NOT NULL
            )
            """
        )
        _conn.execute("CREATE INDEX IF NOT EXISTS idx_steps ON runs(steps DESC)")
        _conn.execute("CREATE INDEX IF NOT EXISTS idx_val ON runs(val DESC)")
        _conn.commit()
    return _conn


def clean_nick(raw):
    if not isinstance(raw, str):
        return None
    nick = raw.strip()
    if not NICK_RE.match(nick):
        return None
    return nick


def valid_entry(body):
    """校验一局数据，返回 (row_dict, None) 或 (None, 错误信息)。"""
    nick = clean_nick(body.get("nickname"))
    if not nick:
        return None, "昵称要 1-12 个字，别带奇怪符号"

    steps = body.get("steps")
    if not isinstance(steps, int) or isinstance(steps, bool) or not (1 <= steps <= 5000):
        return None, "步数不合法"

    best = body.get("best")
    if best is not None:
        if not isinstance(best, dict):
            return None, "皮肤数据不合法"
        tier = best.get("tier")
        grade = best.get("grade", "")
        if tier not in GRADES:
            return None, "皮肤档位不合法"
        if grade not in GRADES[tier]:
            return None, "皮肤等级不合法"
        wear = best.get("wear")
        if wear is not None:
            if not isinstance(wear, (int, float)) or not (0 <= wear <= 5):
                return None, "成色不合法"
            wear = round(float(wear), 2)
        val = best.get("val")
        if not isinstance(val, int) or isinstance(val, bool) or not (0 <= val <= 50_000_000):
            return None, "价值不合法"
        cond = best.get("cond")
        if cond is not None and (not isinstance(cond, str) or len(cond) > 4):
            return None, "成色等级不合法"

        # 档位一律按磨损重算，不信任上传上来的字母。
        # 合成那儿以前是「档位另摇一个」，会产出「极品 C 配 0.66」这种东西。
        if tier == "主皮肤":
            if wear is None:
                return None, "主皮肤得带磨损"
            letter = band_of(wear)
            prefix = "优品" if str(grade).startswith("优品") else "极品"
            grade, cond = prefix + " " + letter, letter
        else:
            grade, cond = "", ""
    else:
        # 一件主皮肤都没抽到，也要能上榜（步数榜），皮肤字段留空
        tier, grade, wear, val, cond = "", "", None, 0, ""

    return {
        "nickname": nick,
        "steps": steps,
        "tier": tier,
        "grade": grade,
        "wear": wear,
        "val": val,
        "cond": cond or "",
    }, None


def too_fast(ip):
    c = db()
    cutoff = int(time.time()) - RATE_WINDOW
    n = c.execute(
        "SELECT COUNT(*) FROM runs WHERE ip = ? AND ts >= ?", (ip, cutoff)
    ).fetchone()[0]
    return n >= RATE_MAX


def _order(kind):
    if kind == "value":
        # 皮肤榜只排「极品」那一档，优品和绿蓝紫都不进来。
        # 磨损越小成色越好，所以正序；磨损一样再比卖价。
        return "wear IS NULL, wear ASC, val DESC, steps DESC, ts ASC", \
               "WHERE grade LIKE '极品%'"
    return "steps DESC, val DESC, ts ASC", ""


def board(kind, limit):
    """同一昵称可以有多局一起排，不做去重。"""
    order, where = _order(kind)
    rows = db().execute(
        f"SELECT id, nickname, steps, tier, grade, wear, val, cond, ts"
        f" FROM runs {where} ORDER BY {order} LIMIT ?",
        (limit,),
    ).fetchall()
    out = []
    for i, r in enumerate(rows, 1):
        out.append({
            "rank": i,
            "nickname": r["nickname"],
            "steps": r["steps"],
            "tier": r["tier"],
            "grade": r["grade"],
            "wear": r["wear"],
            "val": r["val"],
            "cond": r["cond"],
            "ts": r["ts"],
        })
    return out


def rank_of(row_id, kind):
    """这一局在榜上排第几。按 id 定位，所以同名多局也分得清。"""
    order, where = _order(kind)
    rows = db().execute(f"SELECT id FROM runs {where} ORDER BY {order}").fetchall()
    for i, r in enumerate(rows, 1):
        if r["id"] == row_id:
            return i
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "brick-rank/1.0"

    def log_message(self, fmt, *args):  # 少刷日志
        pass

    def _send(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _ip(self):
        fwd = self.headers.get("X-Forwarded-For", "")
        if fwd:
            return fwd.split(",")[0].strip()[:64]
        return self.headers.get("X-Real-IP", "")[:64] or self.client_address[0]

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        if path.endswith("/leaderboard"):
            q = parse_qs(u.query)
            kind = (q.get("type", ["steps"])[0] or "steps").lower()
            if kind not in ("steps", "value"):
                kind = "steps"
            try:
                limit = int(q.get("limit", ["10"])[0])
            except ValueError:
                limit = 10
            limit = max(1, min(limit, 50))
            try:
                self._send(200, {"ok": True, "type": kind, "entries": board(kind, limit)})
            except Exception as e:  # noqa: BLE001
                self._send(500, {"ok": False, "error": str(e)})
            return
        if path.endswith("/health"):
            self._send(200, {"ok": True})
            return
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if not u.path.rstrip("/").endswith("/upload"):
            self._send(404, {"ok": False, "error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 8000:
            self._send(400, {"ok": False, "error": "请求太大或为空"})
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send(400, {"ok": False, "error": "不是合法的 JSON"})
            return
        if not isinstance(body, dict):
            self._send(400, {"ok": False, "error": "不是合法的 JSON"})
            return

        ip = self._ip()
        try:
            if too_fast(ip):
                self._send(429, {"ok": False, "error": "上传太频繁了，歇一会儿再来"})
                return

            row, err = valid_entry(body)
            if err:
                self._send(400, {"ok": False, "error": err})
                return

            c = db()
            cur = c.execute(
                "INSERT INTO runs (nickname, steps, tier, grade, wear, val, cond, ip, ts)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (row["nickname"], row["steps"], row["tier"], row["grade"],
                 row["wear"], row["val"], row["cond"], ip, int(time.time())),
            )
            c.commit()
            run_id = cur.lastrowid

            self._send(200, {
                "ok": True,
                "rank_steps": rank_of(run_id, "steps"),
                "rank_value": rank_of(run_id, "value"),
            })
        except Exception as e:  # noqa: BLE001
            self._send(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    db()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
