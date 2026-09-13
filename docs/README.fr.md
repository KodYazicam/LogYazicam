<p align="center">
  <strong>LogYazicam</strong><br/>
  Un bot de logs Discord. Un seul métier : prendre chaque événement de serveur que Discord émet vraiment, le formater, l’envoyer où tu l’as configuré.
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

Le catalogue complet et chaque variable d’environnement sont dans le **[README anglais](../README.md)**. Les noms d’options slash et les clés d’événements restent en anglais (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — usage libre, **attribution obligatoire**. Le pied d’embed contient toujours `Powered by LogYazicam — KodYazicam`.

## Qu’est-ce que c’est

Pas un bot de modération, musique ou économie. Il observe la passerelle, lit éventuellement le journal d’audit (*qui a fait ça*), et poste un embed (ou un webhook).

Un nouveau serveur ne log **rien** tant que tu n’as pas fait `/log event on` ou `/log group on`.

Sauf `TOKEN`, la config s’applique **sans redémarrage**. `/log locale code:fr` dès le prochain embed.

## Installation

Pas sur npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 ou 22**. Invitation : `bot` + `applications.commands`, bitfield `117888`. **Pas Administrateur.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Premier démarrage

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:fr
/log test
```

## `/log`

| Commande | Effet |
| --- | --- |
| `channel set` / `clear` | Salon de logs par défaut |
| `event on/off key:` | Un événement (autocomplétion) |
| `group on/off name:` | Un groupe entier |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, ex. `Europe/Paris` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | voir le README anglais |

Manage Guild ou `OWNER_IDS`. Réponses éphémères.

## Licence

KYAL-1.0 — [LICENSE](../LICENSE). Catalogue : [English](../README.md#full-event-catalog).
