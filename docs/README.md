# Translated operator READMEs

The **canonical** operator manual is [../README.md](../README.md) (English): full event catalog, every env var, SQLite schema, slash reference.

This folder is the **same product in other languages** — install, first boot, `/log` map, license. Deep tables stay in English so they do not drift.

Developer map (modules, how to add an event or a language): [../src/README.md](../src/README.md) and [../src/locales/README.md](../src/locales/README.md).

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
  <a href="./README.zh.md">简体中文</a> ·
  <a href="./README.sv.md">Svenska</a> ·
  <a href="./README.hi.md">हिन्दी</a> ·
  <a href="./README.id.md">Bahasa Indonesia</a>
</p>

Bot UI languages are **files in `src/locales/`**, not these markdown files. `/log locale` + `/log languages` list whatever `.js` packs are on disk. Adding `sv.js` does not require a new `docs/README.sv.md`, but linking it here and in the root language bar is what makes it discoverable.
