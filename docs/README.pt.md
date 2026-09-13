<p align="center">
  <strong>LogYazicam</strong><br/>
  Um bot de logs do Discord. Um trabalho: pegar cada evento de servidor que o Discord realmente emite, formatar e enviar para onde configuraste.
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

O catálogo completo e cada variável de ambiente estão no **[README em inglês](../README.md)**. Nomes de opções slash e chaves de eventos permanecem em inglês (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — uso livre, **atribuição obrigatória**. O rodapé do embed inclui sempre `Powered by LogYazicam — KodYazicam`.

## O que é

Não é bot de moderação, música ou economia. Observa o gateway, lê opcionalmente o audit log (*quem fez*) e publica um embed (ou webhook).

Um servidor novo **não regista nada** até `/log event on` ou `/log group on`.

Exceto `TOKEN`, a config aplica-se **sem reiniciar**. `/log locale code:pt` no próximo embed.

## Instalação

Não está no npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 ou 22**. Convite: `bot` + `applications.commands`, bitfield `117888`. **Não uses Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## Primeiro arranque

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:pt
/log test
```

## `/log`

| Comando | Efeito |
| --- | --- |
| `channel set` / `clear` | Canal de logs predefinido |
| `event on/off key:` | Um evento (autocompletar) |
| `group on/off name:` | Um grupo inteiro |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, p.ex. `Europe/Lisbon` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | ver README inglês |

Manage Guild ou `OWNER_IDS`. Respostas efémeras.

## Licença

KYAL-1.0 — [LICENSE](../LICENSE). Catálogo: [English](../README.md#full-event-catalog).
