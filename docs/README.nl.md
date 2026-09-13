<p align="center">
  <strong>LogYazicam</strong><br/>
  Een Discord-logbot. Eén taak: elk serverevent dat Discord écht uitzendt formatteren en sturen waar jij het hebt ingesteld.
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

De volledige catalogus en elke env-variabele staan in de **[Engelse README](../README.md)**. Slash-optienamen en event-keys blijven overal Engels (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — vrij te gebruiken, **naamsvermelding verplicht**. De embed-footer bevat altijd `Powered by LogYazicam — KodYazicam`.

## Wat het is

Geen moderatie-, muziek- of economy-bot. Het kijkt naar de gateway, leest optioneel het auditlog (*wie deed dit*) en post een embed (of webhook).

Een nieuwe server logt **niets** tot `/log event on` of `/log group on`.

Behalve `TOKEN` geldt config **zonder herstart**. `/log locale code:nl` vanaf de volgende embed.

## Installatie

Niet op npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 of 22**. Invite: `bot` + `applications.commands`, bitfield `117888`. **Geen Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Eerste start

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:nl
/log test
```

## `/log`

| Commando | Effect |
| --- | --- |
| `channel set` / `clear` | Standaard logkanaal |
| `event on/off key:` | Eén event (autocomplete) |
| `group on/off name:` | Hele groep |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, bijv. `Europe/Amsterdam` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | zie Engelse README |

Manage Guild of `OWNER_IDS`. Antwoorden zijn ephemeral.

## Licentie

KYAL-1.0 — [LICENSE](../LICENSE). Catalogus: [English](../README.md#full-event-catalog).
