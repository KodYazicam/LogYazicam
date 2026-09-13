<p align="center">
  <strong>LogYazicam</strong><br/>
  Discord ログボット。仕事は一つ：Discord が実際に送るギルドイベントを整形し、設定した場所へ送ること。
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

イベント一覧とすべての環境変数は **[英語 README](../README.md)** にあります。スラッシュオプション名とイベントキーは常に英語です（`messageDelete`, `key`, `channel`）。

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — 自由に使えますが **クレジット必須**。Embed フッターには常に `Powered by LogYazicam — KodYazicam` が付きます。

## これは何か

モデレーション・音楽・経済ボットではありません。Gateway を見て、必要なら監査ログ（*誰がやったか*）を読み、embed（または webhook）を送ります。

新しいサーバーは `/log event on` または `/log group on` するまで **何も記録しません**。

`TOKEN` 以外の設定は **再起動不要**。`/log locale code:ja` は次の embed から効きます。

## インストール

npm にはありません。

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 または 22**。招待: `bot` + `applications.commands`、ビットフィールド `117888`。**Administrator は付けない。**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## 初回

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:ja
/log test
```

## `/log`

| コマンド | 効果 |
| --- | --- |
| `channel set` / `clear` | 既定のログチャンネル |
| `event on/off key:` | 単一イベント（オートコンプリート） |
| `group on/off name:` | グループ全体 |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA、例 `Asia/Tokyo` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | 英語 README を参照 |

Manage Guild または `OWNER_IDS`。返信は ephemeral。

## ライセンス

KYAL-1.0 — [LICENSE](../LICENSE)。カタログ: [English](../README.md#full-event-catalog)。
