# IMPREZOWA EKSPEDYCJA — audyt i plan prac (12.11.2026)

Podstawa: archiwum przekazania + dokument przekazania, kod v0.5.2 uruchomiony lokalnie (Node 22, Chrome 390×844, 820×1180, 1920×1080), przegląd wszystkich 49 renderów i repozytorium `lewym90/slad` jako wzorca technicznego.

## 1. Werdykt

Stan faktyczny: **działający prototyp silnika w ubraniu strony internetowej**, nie produkt premium i nie planszówka. Silnik i dane są zdrowe, warstwa „gra” (wygląd, plansza, treść, multiplayer, dźwięk) jest w praktyce do zrobienia od nowa. Nic z przejętego kodu UI nie powinno wejść do wersji docelowej poza logiką.

## 2. Inwentarz

- Kanoniczny kod: `05_APLIKACJA_PWA_ETAP_5/…KONTYNUACJA_v0_5_2`. Silnik Etapu 4 (v1.5.0) jest w nim wbudowany (`src/*.js`, ok. 40 KB). Pakiety 0.5.0/0.5.1 i iteracje silnika 1.1–1.4 to historia, do archiwum.
- `app.js` 30 KB, `styles.css` 8,6 KB, `server.js` 877 B (serwer plików statycznych — **nie ma WebSocketów**).
- Dane: 250 kart, 12 światów, 60 wydarzeń, 8 kart specjalnych, 25 misji, 12 osiągnięć. Pliki danych są zduplikowane w dwóch układach katalogów.
- Grafiki: 49 renderów (kolaże, portrety, 12 plansz, ikona), 113 SVG z Etapu 2 (ikony/przyciski/ramki), 13 JPEG-ów wejściowych.

## 3. Wyniki audytu

| Obszar | Stan | Ocena |
|---|---|---|
| Testy i dane | `npm test` 78/78, `npm run validate` valid=true, 12 plansz 29/29 osiągalnych pól (uruchomione u mnie). Testy sprawdzają silnik i „kontrakty” tekstowe UI, nie to, co widzi gracz. | OK, ale mylące |
| Wygląd aplikacji | Zwykła ciemna strona z napisami. W aplikacji nie ma ani jednej ilustracji (tylko prosty `logo.svg`). Kafle światów pokazują tekst „W01”, „W02”. Bez związku z renderami. | Krytyczne |
| Plansza w grze | Rysowany graf: 24 pola w siatce 6×4 + 3 odnogi, linie rozwidleń przecinają się chaotycznie przez całą planszę. Wygląda jak diagram debugowania. Wszystkie 12 światów mają **tę samą topologię** (różnią się tylko miejscem scalenia odnóg). | Krytyczne |
| Skalowanie | Telefon: poziome przewijanie (szerokość strony 454 px przy ekranie 390 px), pasek górny wychodzi poza ekran. TV 1920×1080: treść w kolumnie max 1600 px, drobne napisy, ok. 60% ekranu puste. Rozmiary w px zamiast jednostek względnych. Brak prawdziwego trybu TV 16:9. | Krytyczne |
| Plansze z renderów | Obrazy 1672×941 (za mało na 4K). „Ścieżka” i pola (START, META, symbole) są **wypalone w obrazie**, więc nie da się ich zgrać z grafem silnika. Każda plansza ma inny układ trasy. Nazwy światów na renderach (Zaginiona Świątynia, Wyspa Piratów, Lodowe Królestwo…) **nie są kanonem** z Etapu 1/3. Kilka plansz to powtórki tej samej dżungli. To właśnie dlatego plansze „są źle wygenerowane”. | Do wymiany |
| Ikona | Ikona w aplikacji to uproszczony wektor (strzałka pobierania wmieszana w kompas, brak korony, płaskie kości). Render #37 (skórzana, złoty kompas, korona, kości 3D) jest wyraźnie lepszy i nadaje się na ikonę po kadrowaniu. | Do wymiany |
| Karty i treść | 250 kart: wszystkie pasują do wszystkich 12 światów, 225 trwa 60 s, 200 daje 2 pkt. Teksty są suche i generyczne („Zapamiętaj cztery słowa z kategorii”, „Podaj skojarzenie… maksymalnie cztery ogniwa”). Quizy to zwykła wiedza („Stolica Kanady”). 60 wydarzeń opisuje mechanikę („+1 wskazówka”), nie robi żartu. Jedna powtórzona nazwa karty. **Nie ma tu nic, co rozśmieszy do łez.** | Do napisania od nowa |
| Wrażenie planszówki | Brak: animowanej kostki, ruchu pionków po planszy, odsłaniania kart, ceremonii tury, narratora, reakcji ekipy. Gra to formularze i przyciski. | Do zaprojektowania |
| Multiplayer | Brak serwera WebSocket, pokoi, kodów, QR, kontrolerów na telefonach, synchronizacji TV. „Kontroler” to panel na tym samym ekranie. | Do zbudowania |
| Offline / PWA | Czcionki ładowane z Google Fonts (`@import`) — **bez sieci wygląd się łamie** i dane wychodzą do Google. Service worker: cache-first bez ścieżki aktualizacji treści, a przy błędzie sieci zwraca `index.html` także dla plików JSON. Dane osiągnięć i kart specjalnych są czytane tylko przez walidator, nie przez aplikację (do potwierdzenia przy integracji). | Do naprawy |
| Dźwięk i animacje | Brak. Przełącznik dźwięku w ustawieniach niczego nie robi. | Do zrobienia |
| Dostępność | Skala tekstu, redukcja ruchu, wysoki kontrast istnieją. Reszta (fokus, czytniki, tryb TV z daleka) niesprawdzona. | Częściowo |

## 4. Konflikt między dokumentem przekazania a nowym zadaniem

Dokument opisuje „luksusowe fantasy / wyprawę” i neutralne karty. Nowe zadanie: gra ma być **bardzo śmieszna**. Proponuję połączyć: wygląd premium zostaje (obsydian, złoto, ilustracje z renderów), ale **treść, narracja, dźwięk i animacje są komediowe** — pompatyczna oprawa kontrastująca z absurdem to sam w sobie dobry żart (poważny konferansjer ogłasza, że ktoś ma bronić swojej pozycji jako „najgorszy pocałunek w historii dyplomacji”).

Zasady bezpieczeństwa z dokumentu zostają: pominięcie karty bez kary, brak przymusu ujawniania sekretów, brak obowiązkowego alkoholu i kontaktu fizycznego, filtr treści przed losowaniem.

## 5. Co zachować, co przepisać

Zachować: silnik (RNG z seedem, talie z antypowtórzeniami, snapshoty, walidatory), 78 testów jako siatkę bezpieczeństwa, kanon 12 światów, zasady bezpieczeństwa, wygląd z renderów (paleta, ramki, portrety).

Przepisać od zera: cały interfejs (ekrany, układ, skalowanie), planszę (rysowaną w kodzie na czystym tle), serwer (WebSocket), obsługę dźwięku i animacji, cache PWA, wszystkie teksty kart/wydarzeń/misji.

## 6. Kluczowe decyzje architektoniczne

1. **Plansza = czyste tło + ścieżka rysowana w kodzie (SVG).** Obrazy bez pól, bez tekstu, 3840×2160. Pola, pionki, kratki, ikony, podświetlenia to warstwa SVG zgodna z grafem silnika; skaluje się idealnie na 4K, telefon i tablet i nigdy nie rozjedzie się z logiką. Zamiast jednej topologii: 12 światów × własny układ ścieżki.
2. **Trzy role ekranu:** TV (publiczny, 16:9, czcionki liczone z `vh`), telefon gracza (prywatny kontroler: kostka, karty, tajne misje, głosowania), host (może być ten sam telefon). Layout oparty o `clamp()`, `dvh`, kontenery CSS, bez stałych px.
3. **Serwer Node.js + WebSocket**, autorytatywny: pokoje, kod 4-znakowy + QR, reconnect, heartbeat, idempotentne akcje, osobne widoki publiczne i prywatne. Działa na Twoim serwerze (Docker + Caddy), statyczna PWA może zostać na GitHub Pages. Tryb jednego urządzenia działa offline bez serwera.
4. **Czcionki, dźwięki i grafiki lokalnie** (jak w ŚLAD: `woff2` z polskimi znakami, WebP, mp3).
5. **Dźwięk generowany lokalnie** (jak `gen_audio.py` w ŚLAD) tam, gdzie się da: kostka, kroki, fanfary, gongi, buzzer. Muzyka i głosy konferansjera — prompty od Ciebie.

## 7. Kierunek treści: jak zrobić, żeby było naprawdę śmiesznie

- **Konferansjer:** stały narrator (pompatyczny, ironiczny) z linijkami na każdą sytuację (rzut 1, rzut 6, pominięcie karty, remis, spóźnienie). Warianty losowane, żeby się nie powtarzały. Jego głos = największy mnożnik śmiechu.
- **Karty przepisane na 12 światów z lokalnym humorem** (Laboratorium Absurdu, Festiwal Chaosu, Hotel na Końcu Świata mają już zalążek). Każdy świat ma 20–30 własnych kart + wspólna pula.
- **Formaty, które robią śmiech ludzi, nie samego tekstu:** udawanie głosu/reklama/dubbing (czytanie absurdalnych linijek), bluff „prawdziwa czy zmyślona definicja” (telefony: gracze wpisują, wszyscy głosują), „Trybunał” (oskarżony broni absurdalnej tezy), „Nagroda publiczności” (głosowanie na najśmieszniejszego), tajne misje „wpleć słowo w rozmowę tak, żeby nikt nie zauważył”, role z tajnymi zadaniami komicznymi.
- **Sędzia = ekipa**, nie algorytm: telefony głosują, TV pokazuje wynik z dramatycznym odliczaniem.
- **Karty chaosu i kary-nagrody wizualne** (np. „Wszyscy mówią z pozycją królika do końca rundy” z opcjonalnym pominięciem).
- Poziomy intensywności: Rodzinnie / Imprezowo / Bez hamulców (bez alkoholu, przemocy i przymusu).
- Redakcja po polsku, ręcznie, z playtestem na prawdziwej ekipie. Tu potrzebuję Twojej weryfikacji, co Cię i Twoich znajomych śmieszy (poczucie humoru jest lokalne).

## 8. Plan prac (kolejność i co kto robi)

**Faza 0 — porządek (ja):** jeden czysty katalog repozytorium, usunięcie duplikatów danych, lokalne czcionki, naprawa SW, testy zielone w CI, tag v0.6.0-baseline.

**Faza 1 — fundament wizualny i skalowanie (ja):** system projektowy z renderów (tokeny, ramki, przyciski jako zasoby), nowe ekrany start / świat / lobby, układ responsywny dla telefonu, tabletu, desktopu, TV; testy zrzutów ekranu na 360×640 … 3840×2160, brak poziomego przewijania.

**Faza 2 — plansza i „fizyczność” (ja, wymaga Twoich grafik tła):** SVG-owa plansza 12 światów, animowana kostka (fizyka, dźwięk), pionki skaczące po polach, kamera przybliżająca pole, odsłanianie karty, ceremonia tury.

**Faza 3 — multiplayer (ja):** serwer WebSocket, pokoje + QR, kontrolery telefonów, widok TV, reconnect, testy prywatności (podsłuch publicznego widoku nie może ujawnić sekretów), test obciążeniowy 10 klientów.

**Faza 4 — treść i humor (ja pisze, Ty weryfikujesz):** 12 światów × własne karty, konferansjer, wydarzenia, misje, osiągnięcia; walidator długości, powtórzeń i filtrów; playtest.

**Faza 5 — dźwięk i animacje:** efekty generowane lokalnie, muzyka i głosy z Twoich promptów, animacje (Lottie/CSS/SVG).

**Faza 6 — odbiór:** symulacje 2–10 graczy × 12 światów × 3 tryby, testy iOS Safari / Android Chrome / Windows / TV (**Ty testujesz na urządzeniach, ja przygotowuję listę kontrolną**), publikacja na GitHub + serwer.

## 9. Grafiki do wygenerowania (prompty dostarczę w osobnym pliku, format jak w ŚLAD)

Format jak w `slad/docs/PROMPTY_GRAFIK_004.md`: bloki po angielsku do wklejenia bez zmian, planszowe arkusze tam, gdzie obiekty są małe (potniesz `tools/cut_sheet.py`), osobne obrazy tam, gdzie liczy się rozdzielczość.

- 12 teł światów, 3840×2160, bez ścieżki, bez pól, bez tekstu (osobne prompty).
- 12 ilustracji kafelka świata (3:2) i 12 nagłówków ekranu świata.
- Ikona aplikacji (kadr z renderu #37 lub nowy) + maskable + splash.
- Konferansjer (portret + 8 póz/emocji).
- Awatary graczy: 10 + opcjonalnie 10 komicznych wariantów (arkusz).
- Pionki 10 (arkusz), kostki, żetony, korona, medale, odznaki osiągnięć (arkusze).
- Rewersy i awersy kart: 10 kategorii + karty specjalne + wydarzenia (arkusze).
- Ramki UI, panele, przyciski, tekstury (arkusze, bez tekstu).
- Elementy komedii: stemple („PORAŻKA”, „LEGENDA”), ikonki reakcji, konfetti sprite.
- Dźwięki (prompty): muzyka lobby / plansza / napięcie / finał, głos konferansjera (linijki w pliku skryptu), efekty uzupełniające. Animacje (prompty): intro, rzut kostką, odsłonięcie karty, finał.

## 10. Czego nie obiecuję

Testów na fizycznych iPhone’ach, Androidach i TV nie wykonam sam — wykonam je w przeglądarce na emulowanych rozdzielczościach i dam listę kontrolną na prawdziwe urządzenia. Humor wymaga playtestu z ludźmi. Do multiplayera na serwerze potrzebuję dostępu SSH lub instrukcji wdrożenia, którą Ci przygotuję.

## 11. Decyzje do potwierdzenia

1. Zostajemy przy kanonie 12 światów z Etapu 1/3 (a rendery plansz traktujemy jako inspirację do nowych teł)?
2. Zgoda na ton: premium oprawa + absurdalny, ironiczny humor, konferansjer z głosem?
3. Backend na Twoim serwerze (WebSocket) jako docelowy, z trybem jednego urządzenia offline jako rezerwą?
