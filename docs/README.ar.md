<p align="center">
  <strong>LogYazicam</strong><br/>
  بوت سجلات Discord. مهمة واحدة: أخذ كل حدث خادم يُصدره Discord فعلًا، تنسيقه، وإرساله إلى المكان الذي ضبطته.
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

الكتالوج الكامل وكل متغيرات البيئة في **[README الإنجليزي](../README.md)**. أسماء خيارات الأوامر ومفاتيح الأحداث تبقى بالإنجليزية (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — استخدام حر، **الإسناد إلزامي**. تذييل الـ embed يتضمن دائمًا `Powered by LogYazicam — KodYazicam`.

## ما هذا

ليس بوت إشراف أو موسيقى أو اقتصاد. يراقب الـ gateway، ويقرأ سجل التدقيق اختياريًا (*من فعل ذلك*)، وينشر embed (أو webhook).

الخادم الجديد **لا يسجّل شيئًا** حتى `/log event on` أو `/log group on`.

عدا `TOKEN` تُطبَّق الإعدادات **بدون إعادة تشغيل**. `/log locale code:ar` من الـ embed التالي.

## التثبيت

ليس على npm.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam && cp .env.example .env
npm install && npm test && npm run deploy && npm start
```

Node **20 أو 22**. الدعوة: `bot` + `applications.commands`، البتفيلد `117888`. **لا تضع Administrator.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## أول تشغيل

```
/log channel set channel:#mod-log
/log group on name:message
/log locale code:ar
/log test
```

## `/log`

| الأمر | الأثر |
| --- | --- |
| `channel set` / `clear` | قناة السجلات الافتراضية |
| `event on/off key:` | حدث واحد (إكمال تلقائي) |
| `group on/off name:` | مجموعة كاملة |
| `ignore add/remove/list` | user / channel / role / category |
| `locale` | `en tr de fr es pt it nl pl ru uk ar ja ko zh` |
| `timezone` | IANA مثل `Asia/Riyadh` |
| `filter` `webhook` `footer` `status` `test` `history` `reload` `events` | انظر README الإنجليزي |

Manage Guild أو `OWNER_IDS`. الردود ephemeral.

## الرخصة

KYAL-1.0 — [LICENSE](../LICENSE). الكتالوج: [English](../README.md#full-event-catalog).
