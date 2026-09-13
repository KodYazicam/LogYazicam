<p align="center">
  <strong>LogYazicam</strong><br/>
  Discord 日志机器人。只做一件事：把 Discord 真正发出的每个服务器事件格式化，并发到你配置的地方。
</p>

<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.tr.md">Türkçe</a> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.pt.md">Português</a> ·
  <a href="./README.it.md">Italiano</a> ·
  <a href="./README.nl.md">Nederlands</a> ·
  <a href="./README.pl.md">Polski</a> ·
  <a href="./README.ru.md">Русский</a> ·
  <a href="./README.uk.md">Українська</a> ·
  <a href="./README.ar.md">العربية</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.ko.md">한국어</a> ·
  <a href="./README.zh.md">简体中文</a>
</p>

完整事件目录和每条环境变量见 **[英文 README](../README.md)**。斜杠选项名和事件键始终为英文（`messageDelete`、`key`、`channel`）。

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — 可自由使用，**必须署名**。Embed 页脚始终带有 `Powered by LogYazicam — KodYazicam`。

## 这是什么

不是管理、音乐或经济机器人。它监听网关，可选读取审计日志（*是谁做的*），然后发送 embed（或 webhook）。

新服务器在你执行 `/log event on` 或 `/log group on` 之前 **不会记录任何内容**。

除 `TOKEN` 外，配置 **无需重启**。`/log locale code:zh` 从下一条 embed 起生效。

## 安装

不在 npm 上。

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 或 22**。邀请：`bot` + `applications.commands`，权限位 `117888`。**不要勾选 Administrator。**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## 首次启动

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:zh
/log test
```

## `/log`

| 命令 | 作用 |
| --- | --- |
| `channel set` / `clear` | 默认日志频道 |
| `event on/off key:` | 单个事件（自动补全） |
| `group on/off name:` | 整个分组 |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA，如 `Asia/Shanghai` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | 见英文 README |

需要 Manage Guild 或 `OWNER_IDS`。回复为 ephemeral。

## 许可

KYAL-1.0 — [LICENSE](../LICENSE)。目录：[English](../README.md#full-event-catalog)。
