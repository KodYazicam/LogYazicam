<p align="center">
  <strong>LogYazicam</strong><br/>
  Un bot di log Discord. Un solo compito: prendere ogni evento di server che Discord emette davvero, formattarlo e inviarlo dove l’hai configurato.
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

Il catalogo completo e ogni variabile d’ambiente sono nel **[README inglese](../README.md)**. I nomi delle opzioni slash e le chiavi evento restano in inglese (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — uso libero, **attribuzione obbligatoria**. Il footer dell’embed include sempre `Powered by LogYazicam — KodYazicam`.

## Cos’è

Non è un bot di moderazione, musica o economia. Osserva il gateway, legge opzionalmente l’audit log (*chi l’ha fatto*) e pubblica un embed (o un webhook).

Un server nuovo **non registra nulla** finché non usi `/log event on` o `/log group on`.

Tranne `TOKEN`, la config si applica **senza riavvio**. `/log locale code:it` dal prossimo embed.

## Installazione

Non è su npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 o 22**. Invito: `bot` + `applications.commands`, bitfield `117888`. **Non Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Primo avvio

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:it
/log test
```

## `/log`

| Comando | Effetto |
| --- | --- |
| `channel set` / `clear` | Canale di log predefinito |
| `event on/off key:` | Un evento (autocompletamento) |
| `group on/off name:` | Un intero gruppo |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, es. `Europe/Rome` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | vedi README inglese |

Manage Guild o `OWNER_IDS`. Risposte effimere.

## Licenza

KYAL-1.0 — [LICENSE](../LICENSE). Catalogo: [English](../README.md#full-event-catalog).
