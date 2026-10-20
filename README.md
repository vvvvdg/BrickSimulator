# 抽砖模拟器 BrickSimulator

一个纯前端的「开砖」模拟器：抽奖、赌博模式、金库、合成、天赋，外加一个带排行榜的小服务端。

线上跑在 <http://qint.top/brick/>。

## 里面有什么

**前端（`web/`，纯静态，不需要构建）**

- `index.html` — 主菜单
- `draw.html` / `app.js` / `style.css` — 模拟抽奖，保底进度、出货统计
- `gamble.html` / `gamble.js` / `gamble.css` — 赌博模式：拿步数换抽数，破产结算
- `rank.html` — 排行榜，步数榜 / 皮肤榜两个，点行看详情
- `economy.js` — 经济与规则层：档位、磨损、合成表、天赋池，浏览器和 Node 都能跑
- `data.js` — 皮肤档位表、磨损分档、配色
- `menu.css` — 主菜单样式

**服务端（`server/server.py`）**

只做排行榜，Python 标准库 + SQLite，没第三方依赖。

```bash
python3 server/server.py    # 默认监听 127.0.0.1:8787，库文件在同目录 brick.db
```

接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/leaderboard?type=steps&limit=20` | 步数榜，按步数降序 |
| GET | `/api/leaderboard?type=value&limit=20` | 皮肤榜，只收极品，按磨损升序 |
| POST | `/api/upload` | 上传一局，体见下 |

上传体：

```json
{
  "nickname": "猫猫头",
  "steps": 137,
  "best": { "tier": "主皮肤", "grade": "极品 A", "wear": 0.83, "val": 12800, "cond": "A" }
}
```

服务端会做几件事：昵称 1–12 字；步数 1–5000；每 IP 每小时最多 30 次；**档位按磨损重算**，不信客户端报上来的字母，避免出现「磨损 0.66 却是极品 C」这种自相矛盾的数据。

**开发脚本（`tools/`）**

`sim.cjs`、`simgamble.cjs`、`sweep.cjs` 用来跑经济曲线和模拟；`shot.cjs` 是无头 Chrome 截图脚本，用 CDP 直接抓页面，调样式的时候很省事。

## 本地看

前端是纯静态，直接起个静态服务器就行：

```bash
python -m http.server 8000 --directory web
```

排行榜要服务端和前端同一来源时，用 nginx 把 `/brick/api/` 反代到 `127.0.0.1:8787`。

## 部署参考

```nginx
location /brick/ {
    alias /usr/share/nginx/html/brick/;
    try_files $uri $uri/ /brick/index.html;
}
location /brick/api/ {
    proxy_pass http://127.0.0.1:8787/api/;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

```ini
[Unit]
Description=brick rank
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/brick-rank/server.py
WorkingDirectory=/opt/brick-rank
Restart=always

[Install]
WantedBy=multi-user.target
```

## 规则备忘

- 磨损分档：S ≤ 0.40，A ≤ 1.25，B ≤ 2.50，C ≤ 4.00
- 合成出来的档位跟着磨损走，前缀（极品 / 优品）另摇
- 皮肤榜只排极品，磨损越小越靠前
