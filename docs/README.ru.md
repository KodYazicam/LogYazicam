<p align="center">
  <strong>LogYazicam</strong><br/>
  Бот логов Discord. Одна задача: взять каждое событие сервера, которое Discord реально отправляет, оформить и послать туда, куда вы настроили.
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

Полный каталог и каждая переменная окружения — в **[английском README](../README.md)**. Имена slash-опций и ключи событий везде английские (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — свободно, **указание авторства обязательно**. В подвале embed всегда `Powered by LogYazicam — KodYazicam`.

## Что это

Не модерация, не музыка, не экономика. Смотрит gateway, при необходимости читает журнал аудита (*кто сделал*) и публикует embed (или webhook).

Новый сервер **ничего не пишет**, пока вы не сделаете `/log event on` или `/log group on`.

Кроме `TOKEN` конфиг применяется **без перезапуска**. `/log locale code:ru` со следующего embed.

## Установка

Не в npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 или 22**. Приглашение: `bot` + `applications.commands`, битфилд `117888`. **Не ставьте Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Первый запуск

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:ru
/log test
```

## `/log`

| Команда | Эффект |
| --- | --- |
| `channel set` / `clear` | Канал логов по умолчанию |
| `event on/off key:` | Одно событие (автодополнение) |
| `group on/off name:` | Вся группа |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, напр. `Europe/Moscow` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | см. английский README |

Manage Guild или `OWNER_IDS`. Ответы ephemeral.

## Лицензия

KYAL-1.0 — [LICENSE](../LICENSE). Каталог: [English](../README.md#full-event-catalog).
