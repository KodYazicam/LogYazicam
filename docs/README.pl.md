<p align="center">
  <strong>LogYazicam</strong><br/>
  Bot logów Discord. Jedno zadanie: wziąć każde zdarzenie serwera, które Discord naprawdę wysyła, sformatować i wysłać tam, gdzie je skonfigurowałeś.
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

Pełny katalog i każda zmienna env są w **[angielskim README](../README.md)**. Nazwy opcji slash i klucze zdarzeń zostają po angielsku (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — wolne użycie, **wymagane uznanie autorstwa**. Stopka embeda zawsze zawiera `Powered by LogYazicam — KodYazicam`.

## Czym jest

To nie bot moderacji, muzyki ani ekonomii. Obserwuje gateway, opcjonalnie czyta dziennik audytu (*kto to zrobił*) i publikuje embed (lub webhook).

Nowy serwer **nic nie loguje**, dopóki nie użyjesz `/log event on` lub `/log group on`.

Poza `TOKEN` konfiguracja działa **bez restartu**. `/log locale code:pl` od następnego embeda.

## Instalacja

Nie ma na npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 lub 22**. Zaproszenie: `bot` + `applications.commands`, bitfield `117888`. **Nie zaznaczaj Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Pierwszy start

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:pl
/log test
```

## `/log`

| Komenda | Efekt |
| --- | --- |
| `channel set` / `clear` | Domyślny kanał logów |
| `event on/off key:` | Jedno zdarzenie (autouzupełnianie) |
| `group on/off name:` | Cała grupa |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, np. `Europe/Warsaw` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | zobacz angielski README |

Manage Guild lub `OWNER_IDS`. Odpowiedzi ephemeral.

## Licencja

KYAL-1.0 — [LICENSE](../LICENSE). Katalog: [English](../README.md#full-event-catalog).
