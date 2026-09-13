<p align="center">
  <strong>LogYazicam</strong><br/>
  Un bot de registros de Discord. Un trabajo: tomar cada evento de servidor que Discord emite de verdad, formatearlo y enviarlo donde lo configuraste.
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

El catálogo completo y cada variable de entorno están en el **[README en inglés](../README.md)**. Los nombres de opciones slash y las claves de eventos siguen en inglés (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — uso libre, **atribución obligatoria**. El pie del embed siempre incluye `Powered by LogYazicam — KodYazicam`.

## Qué es

No es un bot de moderación, música ni economía. Observa el gateway, lee opcionalmente el registro de auditoría (*quién lo hizo*) y publica un embed (o un webhook).

Un servidor nuevo **no registra nada** hasta `/log event on` o `/log group on`.

Salvo `TOKEN`, la config aplica **sin reiniciar**. `/log locale code:es` desde el siguiente embed.

## Instalación

No está en npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 o 22**. Invitación: `bot` + `applications.commands`, bitfield `117888`. **No Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Primer arranque

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:es
/log test
```

## `/log`

| Comando | Efecto |
| --- | --- |
| `channel set` / `clear` | Canal de logs por defecto |
| `event on/off key:` | Un evento (autocompletar) |
| `group on/off name:` | Un grupo entero |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, p. ej. `Europe/Madrid` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | ver README inglés |

Manage Guild o `OWNER_IDS`. Respuestas efímeras.

## Licencia

KYAL-1.0 — [LICENSE](../LICENSE). Catálogo: [English](../README.md#full-event-catalog).
