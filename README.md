# IMPREZOWA EKSPEDYCJA

Gra towarzyska bez końca: planszówka na ekranie telewizora, komputera lub telefonu. PWA, działa offline po pierwszym uruchomieniu.

**Wersja 0.6.0 — Faza 0 i 1.** Zobacz `docs/STATUS.md`, żeby wiedzieć, co jest gotowe, a co jeszcze nie.

## Uruchomienie
```bash
npm run serve        # http://localhost:4173  (Node >= 18)
npm test             # buduje dane i service worker, uruchamia 74 testy
npm run e2e          # pełne rozgrywki w prawdziwej przeglądarce na 6 rozmiarach ekranu (Playwright + Chrome)
```
Po zmianie plików w `assets/`, `js/`, `css/`, `src/` lub `data/` uruchom `npm run build` (odświeża `sw.js` i listę grafik).

## Struktura
- `index.html`, `app.js` — ekrany (start, wybór świata, konfiguracja, gra, modale)
- `js/layout.js` — układ trasy planszy (inny kształt dla każdego świata)
- `js/board-view.js` — plansza SVG: tło-ilustracja, trasa, pola, pionki, kamera, animacja ruchu
- `src/` — silnik gry (bez zależności od przeglądarki, deterministyczny przy seedzie)
- `data/` — karty, światy, wydarzenia, misje, osiągnięcia (jedna kanoniczna kopia)
- `assets/` — czcionki, tła, awatary, ikony. Grafiki z `docs/PROMPTY_GRAFIK.md` wrzucasz pod nazwami z `docs/manifest_assets.csv`
- `tools/` — `build-sw.mjs`, `build-data.mjs`, `cut_sheet.py` (cięcie arkuszy grafik), `e2e.mjs`

## Podmiana grafik
Pola (`assets/tiles/*.webp`) i pionki (`assets/pawns/pawn-NN.webp`) są wykrywane automatycznie przez `npm run build` — interfejs użyje ich zamiast wektorowych zastępników. Tła planszy to `assets/boards/Wxx.webp` (obecnie tymczasowe, rozmyte z renderów).

## Publikacja
GitHub Pages hostuje statyczną grę (ścieżki są względne). Tryb wielu urządzeń będzie wymagał serwera WebSocket (Faza 3).
