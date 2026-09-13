<p align="center">
  <strong>LogYazicam</strong><br/>
  Бот логів Discord. Одне завдання: взяти кожну подію сервера, яку Discord справді надсилає, оформити й відправити туди, куди ви налаштували.
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

Повний каталог і кожна змінна оточення — в **[англійському README](../README.md)**. Імена slash-опцій і ключі подій скрізь англійські (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — вільно, **зазначення авторства обов’язкове**. У підвалі embed завжди `Powered by LogYazicam — KodYazicam`.

## Що це

Не модерація, не музика, не економіка. Дивиться gateway, за потреби читає журнал аудиту (*хто зробив*) і публікує embed (або webhook).

Новий сервер **нічого не пише**, доки ви не зробите `/log event on` або `/log group on`.

Крім `TOKEN` конфіг застосовується **без перезапуску**. `/log locale code:uk` з наступного embed.

## Встановлення

Не в npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 або 22**. Запрошення: `bot` + `applications.commands`, бітфілд `117888`. **Не ставте Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Перший запуск

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:uk
/log test
```

## `/log`

| Команда | Ефект |
| --- | --- |
| `channel set` / `clear` | Канал логів за замовчуванням |
| `event on/off key:` | Одна подія (автодоповнення) |
| `group on/off name:` | Уся група |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, напр. `Europe/Kyiv` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | див. англійський README |

Manage Guild або `OWNER_IDS`. Відповіді ephemeral.

## Ліцензія

KYAL-1.0 — [LICENSE](../LICENSE). Каталог: [English](../README.md#full-event-catalog).
