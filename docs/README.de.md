<p align="center">
  <strong>LogYazicam</strong><br/>
  Ein Discord-Logging-Bot. Eine Aufgabe: jedes Gilden-Event, das Discord wirklich sendet, formatieren und dorthin schicken, wo du es konfiguriert hast.
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

Der vollständige Event-Katalog und jede Env-Zeile stehen in der **[englischen README](../README.md)**. Slash-Optionsnamen und Event-Keys bleiben überall Englisch (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — Nutzung frei, **Namensnennung Pflicht**. Embed-Footer enthält immer `Powered by LogYazicam — KodYazicam`.

## Was es ist

Kein Moderations-, Musik- oder Economy-Bot. Es warnt, kickt und spielt nicht. Es beobachtet das Gateway, liest optional das Audit-Log (*wer hat das getan*) und postet ein Embed (oder einen Webhook).

Eine neue Gilde loggt **nichts**, bis du `/log event on` oder `/log group on` nutzt.

Außer `TOKEN` gilt Config **ohne Neustart**. `/log locale code:de` gilt ab dem nächsten Embed.

## Installation

Nicht auf npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam
cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 oder 22**. Invite: `bot` + `applications.commands`, Bitfeld `117888`. **Kein Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Erster Start

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:de
/log test
```

Dann eine sichtbare Nachricht löschen.

## `/log`

| Befehl | Wirkung |
| --- | --- |
| `channel set` / `clear` | Standard-Logkanal |
| `event on/off key:` | Einzelnes Event (Autocomplete) |
| `group on/off name:` | Ganze Gruppe |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, z. B. `Europe/Berlin` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | siehe englische README |

Manage Guild oder `OWNER_IDS`. Antworten sind ephemeral. Optionsnamen bleiben Englisch.

## Umgebung

`TOKEN`, `CLIENT_ID`, `GUILD_ID`, `OWNER_IDS`, `DATABASE_PATH`, `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`, `HOT_RELOAD_MS`, `IGNORE_*`, `EMBED_*`, Queue-Limits — alles englische Keys. Details: [Environment](../README.md#environment-reference).

## Event-Gruppen

`message` `member` `moderation` `invite` `channel` `thread` `role` `emoji` `sticker` `voice` `stage` `server` `webhook` `integration` `event` `automod` `command` `audit` `presence` `user`

`presence` und `user` standardmäßig **aus**. Katalog: [English](../README.md#full-event-catalog).

## Lizenz

KYAL-1.0 — [LICENSE](../LICENSE).
