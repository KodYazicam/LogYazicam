<p align="center">
  <strong>LogYazicam</strong><br/>
  Discord 로그 봇. 할 일은 하나: Discord가 실제로 보내는 길드 이벤트를 포맷해서 설정한 곳으로 보내는 것.
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

전체 카탈로그와 모든 환경 변수는 **[영어 README](../README.md)** 에 있습니다. 슬래시 옵션 이름과 이벤트 키는 항상 영어입니다(`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — 자유롭게 쓰되 **저작자 표기 필수**. Embed 푸터에는 항상 `Powered by LogYazicam — KodYazicam` 이 붙습니다.

## 무엇인가

 моде레이션·음악·경제 봇이 아닙니다. 게이트웨이를 보고, 필요하면 감사 로그(*누가 했는지*)를 읽고 embed(또는 webhook)를 보냅니다.

새 서버는 `/log event on` 또는 `/log group on` 하기 전까지 **아무것도 기록하지 않습니다**.

`TOKEN` 외 설정은 **재시작 없이** 적용됩니다. `/log locale code:ko` 는 다음 embed부터입니다.

## 설치

npm에 없습니다.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 또는 22**. 초대: `bot` + `applications.commands`, 비트필드 `117888`. **Administrator 체크하지 마세요.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## 첫 실행

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:ko
/log test
```

## `/log`

| 명령 | 효과 |
| --- | --- |
| `channel set` / `clear` | 기본 로그 채널 |
| `event on/off key:` | 단일 이벤트(자동완성) |
| `group on/off name:` | 그룹 전체 |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA, 예 `Asia/Seoul` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | 영어 README 참고 |

Manage Guild 또는 `OWNER_IDS`. 응답은 ephemeral.

## 라이선스

KYAL-1.0 — [LICENSE](../LICENSE). 카탈로그: [English](../README.md#full-event-catalog).
