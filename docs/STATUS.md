# Status — wersja 0.6.0 (12.11.2026)

## Zrobione i sprawdzone
- Czysty projekt: jedna kopia danych, silnik z Etapu 4 bez zmian, 74 testy przechodzą (`npm test`).
- Nowy interfejs: start, wybór świata, konfiguracja (2–10 graczy, tryb, klimat Rodzinnie/Imprezowo/18+), gra, kontroler prywatny, ustawienia, kopia zapasowa.
- Skalowanie: rem zależny od okna (telefon → 4K), brak poziomego przewijania sprawdzony na 6 rozmiarach (390×844, 844×390, 820×1180, 1440×900, 1920×1080, 3840×2160).
- Plansza: tło + trasa SVG + pola + pionki z animacją skoku po polach + kamera (cała trasa na szerokim ekranie, śledzenie pionka na pionowym). Własny kształt trasy dla każdego z 12 światów.
- Kostka 3D z animacją (wszystkie 6 ścianek sprawdzone).
- PWA: czcionki lokalne, service worker generowany z listy plików (aktualizacja przy zmianie), manifest z ikoną maskable, ikona z renderu #37.
- `npm run e2e`: pełne rozgrywki przez interfejs (do fazy FINISHED) na 6 rozmiarach, bez błędów w konsoli.

## Tymczasowe (czeka na grafiki od Ciebie)
- Tła planszy to rozmyte rendery (`assets/boards/`), karty światów to oryginalne rendery. Pola i pionki to wektory/portrety, dopóki nie pojawią się `assets/tiles` i `assets/pawns`.
- Przyporządkowanie renderów do światów jest przybliżone.

## Nie zrobione (kolejne fazy)
- Faza 2: dopracowanie planszy z docelowymi tłami, ceremonia tury, odsłanianie kart, zbliżenia kamery.
- Faza 3: serwer WebSocket, pokoje, QR, osobne telefony, widok TV zsynchronizowany. Dziś „kontroler” to panel na tym samym urządzeniu.
- Faza 4: treść komediowa (karty, konferansjer, wydarzenia, misje, tryb 18+). Teksty kart są nadal z Etapu 3.
- Faza 5: dźwięk i animacje (przełącznik w ustawieniach niczego jeszcze nie włącza).
- Testy na fizycznych iPhone/Android/TV i playtesty z ludźmi — nie wykonane.
