<p align="center">
  <strong>LogYazicam</strong><br/>
  Discord log botu. Discord’un gerçekten yaydığı her sunucu olayını alır, biçimlendirir, senin ayarladığın kanala gönderir.
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

Tam olay kataloğu, SQLite şeması ve her env satırı **[İngilizce README](../README.md)** içindedir. Slash seçenek adları ve olay anahtarları her dilde İngilizce kalır (`messageDelete`, `key`, `channel`).

```
Author : Batuhan (KodYazicam)
Project: LogYazicam
Source : https://github.com/KodYazicam/LogYazicam
```

**KYAL-1.0** — kullan, değiştir; **atıf zorunlu**. Embed altbilgisine `Powered by LogYazicam — KodYazicam` her zaman eklenir.

## Bu nedir

Moderasyon, müzik veya ekonomi **değil**. Uyarı/ban/müzik yok. Gateway’i izler, isteğe bağlı audit log’dan *kim yaptı* bilgisini okur, embed (veya webhook) basar.

Yeni sunucuda **hiçbir olay açık değildir**. `/log event on` veya `/log group on` şart.

`TOKEN` dışında config **restart istemez**. `/log locale code:tr` bir sonraki embed’den itibaren Türkçe başlık üretir.

## Kurulum

npm’de yok.

```bash
git clone https://github.com/KodYazicam/LogYazicam.git
cd LogYazicam
cp .env.example .env
# TOKEN ve CLIENT_ID doldur
npm install
npm test
npm run deploy
npm start
```

Node **20 veya 22**. Davet: `bot` + `applications.commands`, bitfield `117888` (View, Send, Embed, Attach, History, View Audit Log). **Administrator işaretleme.**

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=117888
```

## İlk açılış

```
/log channel set channel:#mod-log
/log group on name:message
/log group on name:member
/log locale code:tr
/log timezone tz:Europe/Istanbul
/log test
```

Sonra botun gördüğü bir kanalda mesaj sil. `#mod-log` içinde `Mesaj silindi` embed’i gelmeli.

## `/log` (seçenek adları İngilizce)

| Komut | Ne yapar |
| --- | --- |
| `/log channel set` / `clear` | Varsayılan log kanalı |
| `/log event on key:…` / `off` | Tek olay. `key` otomatik tamamlanır |
| `/log group on name:voice` / `off` | Grup (message, member, moderation, voice, …) |
| `/log ignore add kind:user id:…` | Kullanıcı/kanal/rol/kategori yok say |
| `/log locale code:tr` | Bot arayüz dili (`en tr de fr es pt it nl pl ru uk ar ja ko zh`) |
| `/log timezone tz:Europe/Istanbul` | IANA saat dilimi |
| `/log filter name:ignore_bots value:False` | Boolean filtre |
| `/log webhook` | Webhook ile gönder |
| `/log footer` | Altbilgi öneki (atıf silinmez) |
| `/log status` / `test` / `history` / `reload` / `events` | Durum, deneme, dışa aktar, yenile, anahtar listesi |

Manage Guild veya `OWNER_IDS` gerekir. Yanıtlar ephemeral.

## Ortam (İngilizce anahtarlar)

`TOKEN`, `CLIENT_ID`, `GUILD_ID`, `OWNER_IDS`, `DATABASE_PATH`, `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`, `LOG_LEVEL`, `LOG_FILE`, `ERROR_CHANNEL_ID`, `ERROR_DM_OWNER`, `HOT_RELOAD_MS`, `MAX_QUEUE_PER_CHANNEL`, `SEND_INTERVAL_MS`, `AUDIT_MAX_AGE_MS`, `WEBHOOK_NAME`, `WEBHOOK_AVATAR_URL`, `EMBED_*`, `IGNORE_*`, `STORE_HISTORY`, `HISTORY_LIMIT`.

Ayrıntı: [İngilizce README — Environment](../README.md#environment-reference).

## Olay grupları

`message` `member` `moderation` `invite` `channel` `thread` `role` `emoji` `sticker` `voice` `stage` `server` `webhook` `integration` `event` `automod` `command` `audit` `presence` `user`

`presence` ve `user` varsayılan **kapalı**. Ses, tek Discord olayı `voiceStateUpdate` → `voiceJoin` / `Leave` / `Move` / …

Tam tablo: [İngilizce README — catalog](../README.md#full-event-catalog).

## Lisans

KYAL-1.0 — [LICENSE](../LICENSE). Çatallarda atıf kalsın.
