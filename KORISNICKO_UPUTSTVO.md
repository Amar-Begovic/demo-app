# ProTrack v1.2.0 — Korisničko uputstvo

## Šta je ProTrack?

ProTrack-v1.2.0 je web aplikacija za kompletno praćenje proizvodnje kreveta. Pokriva cijeli proces — od upravljanja materijalima i definicije artikala, preko kreiranja proizvodnih naloga i automatske nabavke, do praćenja rada po odjelima putem sistema identifikatora (jedan identifikator po dijelu) i barkod skeniranja, te mjerenja vremena proizvodnje.

Aplikacija se otvara u web pregledniku (Chrome, Firefox, Edge) i radi na bilo kojem uređaju sa pristupom mreži.

---

## Navigacija

Nakon otvaranja aplikacije, na lijevoj strani ekrana nalazi se sidebar sa svim modulima:

| Ikona | Modul | Opis |
|-------|-------|------|
| 🏠 | **Početna** | Dashboard sa pregledom stanja |
| 📦 | **Materijali** | Upravljanje sirovinama i zalihama |
| 📐 | **Artikli** | Definicija proizvoda i sastavnica (BOM) |
| 🏢 | **Odjeli** | Proizvodni odjeli (metal, tapacirung, montaža...) |
| 🚚 | **Dobavljači** | Dobavljači materijala |
| 📋 | **Proizvodni nalozi** | Kreiranje i praćenje proizvodnje |
| 🛒 | **Nabavka** | Nalozi za nabavku materijala |
| 📷 | **Skeniranje** | Skeniranje identifikatora za praćenje rada |
| 📊 | **Izvještaji** | Statistike i prosječna vremena |

---

## 1. Početna stranica (Dashboard)

Početna stranica prikazuje pregled kompletnog stanja proizvodnje na jednom mjestu.

### Kartice sa statistikama

Na vrhu se nalaze 4 kartice:

- **Ukupno naloga** — Koliko ukupno proizvodnih naloga postoji u sistemu, sa brojem aktivnih
- **U izradi** — Koliko naloga je trenutno u fazi proizvodnje
- **Završeno** — Koliko naloga je kompletno završeno
- **Niske zalihe** — Koliko materijala ima količinu ispod definisanog minimuma (upozorenje)

### Tabela aktivnih naloga

Ispod kartica je tabela sa svim aktivnim (nezavršenim) proizvodnim nalozima. Za svaki nalog se vidi:

- Naziv artikla (klikabilan — vodi na detalje naloga)
- Količina
- Status (Nacrt, Čeka materijal, Spreman, U izradi, Završen)
- Progress bar sa procentom završenosti
- Datum kreiranja

---

## 2. Materijali

Modul za upravljanje svim sirovinama koje se koriste u proizvodnji (drvo, tkanina, metal, vijci, ljepilo, itd.).

### Pregled materijala

Stranica prikazuje tabelu svih materijala sa kolonama:

- **Naziv** — Ime materijala
- **Jedinica** — Jedinica mjere (kom, m, kg, m², itd.)
- **Količina** — Trenutna količina na stanju
- **Minimum** — Minimalna količina ispod koje sistem upozorava
- **Status** — Crveni badge "Niske zalihe" ako je količina ispod minimuma, ili zeleni "U redu"

### Sortiranje

Kliknite na zaglavlje kolone "Naziv" ili "Količina" da sortirate tabelu. Ponovni klik mijenja smjer (rastuće/opadajuće).

### Pretraga

Polje za pretragu iznad tabele filtrira materijale po imenu u realnom vremenu (case-insensitive).

### Dodavanje novog materijala

1. Kliknite dugme **"Novi materijal"** u gornjem desnom uglu
2. Popunite formu:
   - **Naziv** — Obavezno polje, ime materijala
   - **Jedinica mjere** — Obavezno polje (npr. kom, m, kg)
   - **Trenutna količina** — Koliko je trenutno na stanju
   - **Minimalna količina** — Ispod ove vrijednosti sistem prikazuje upozorenje
3. Kliknite **"Dodaj"**

### Uređivanje materijala

Kliknite ikonu olovke (✏️) pored materijala u tabeli. Otvara se isti dialog sa popunjenim podacima koje možete izmijeniti.

---

## 3. Artikli (Proizvodi)

Modul za definiciju gotovih proizvoda (kreveta) sa kompletnom sastavnicom — koji dijelovi su potrebni, koji odjel ih radi, i koji materijali su potrebni za svaki dio.

### Lista artikala

Tabela prikazuje sve artikle sa:

- Naziv i opis
- Broj dijelova u sastavnici
- Odjeli koji učestvuju u proizvodnji
- Datum kreiranja

### Kreiranje novog artikla

1. Kliknite **"Novi artikal"**
2. Unesite naziv i opcionalni opis
3. Kliknite **"Kreiraj"**
4. Artikal se kreira bez dijelova — dijelove dodajete u BOM editoru

### BOM Editor (Sastavnica)

Kliknite ikonu oka (👁) pored artikla da otvorite BOM editor. Ovo je najvažniji dio definicije artikla.

#### Osnovni podaci

Na vrhu stranice nalazi se kartica sa osnovnim podacima artikla:

**Red 1:**
- **Naziv** — Obavezno polje, ime artikla
- **Šifra** — Opcionalno, SKU ili interna šifra artikla
- **Vrsta** — Opcionalno, tip artikla (Gotov proizvod, Poluproizvod, Sirovina, Usluga)

**Red 2:**
- **Opis** — Opcionalni opis artikla
- **Dimenzije** — Opcionalno, npr. "120x200" za krevet
- **Jedinica mjere** — Opcionalno, jedinica u kojoj se artikal mjeri (kom, m, m², m³, kg, g, l, rol, par, milla)

**Red 3:**
- **Neaktivan artikal** — Checkbox za označavanje neaktivnih artikala (npr. artikli koji se više ne proizvode)

#### Cijena

Ispod osnovnih podataka nalazi se kartica za definiciju cijene artikla:

- **Valuta** — Odaberite valutu (BAM, EUR, USD)
- **Cijena bez PDV** — Unesite cijenu bez poreza
- **Porez %** — Procenat poreza (default 17% za BiH)
- **Cijena sa PDV** — Automatski se izračunava na osnovu cijene bez PDV i procenta poreza (read-only polje)

#### Dijelovi (BOM)

Ovdje definirate sve dijelove od kojih se artikal sastoji. Za svaki dio:

1. Kliknite **"Dodaj dio"**
2. Popunite:
   - **Naziv dijela** — npr. "Metalna konstrukcija", "Presvlaka", "Madrac"
   - **Odjel** — Koji odjel izrađuje ovaj dio (odaberite iz padajućeg menija)
   - **Dimenzije** — Opcionalno, npr. "200x160x30 cm"
   - **Napomene / Instrukcije** — Opcionalno, specifične upute za proizvodnju tog dijela (npr. "Koristiti bijelu tkaninu", "Dupli šav na rubovima", "Lakirati 2x")
3. Za svaki dio dodajte materijale:
   - Kliknite **"Dodaj materijal"** unutar dijela
   - Odaberite materijal iz padajućeg menija
   - **Dimenzije** — Unesite dimenzije materijala specifične za ovaj dio (npr. "210x145" za tkaninu, "186x18x7" za spužvu)
   - **Količina** — Unesite količinu potrebnu za jedan komad ovog dijela
   - **Jedinica** — Automatski se prikazuje jedinica mjere materijala
4. Kliknite **"Spremi promjene"** na vrhu stranice

#### Kalkulacija potreba materijala

Na dnu BOM editora nalazi se kalkulator:

1. Unesite željenu količinu artikala (npr. 10)
2. Kliknite **"Izračunaj"**
3. Sistem prikazuje tabelu sa:
   - Ukupna potrebna količina svakog materijala
   - Koliko je trenutno na stanju
   - Deficit (koliko fali)
   - Status — "Dovoljno" ili "Nedostaje"

---

## 4. Odjeli

Modul za definiciju proizvodnih odjela u firmi.

### Lista odjela

Tabela sa svim odjelima (naziv, opis, datum kreiranja).

### Kreiranje odjela

1. Kliknite **"Novi odjel"**
2. Unesite naziv (npr. "Metal", "Tapacirung", "Montaža", "Lakiranje")
3. Opcionalno dodajte opis
4. Kliknite **"Dodaj"**

### Dashboard odjela

Kliknite ikonu oka (👁) pored odjela da vidite detaljan pregled:

- **Kartice sa statistikama**: Koliko radnih naloga čeka, koliko je u izradi, koliko je završeno, i prosječno vrijeme izrade
- **Tabovi sa radnim nalozima**:
  - **Čeka** — Nalozi koji čekaju da se započnu
  - **U izradi** — Nalozi koji su trenutno u procesu
  - **Završeno** — Završeni nalozi sa vremenima (započeto, završeno, trajanje)

### Tabla odjela (Kanban prikaz)

Kliknite link **"Tabla"** na stranici odjela da otvorite Kanban prikaz radnih naloga.

Tabla prikazuje tri kolone:
- **To Do** — Radni nalozi koji čekaju (status: pending)
- **In Progress** — Radni nalozi u izradi (status: in_progress)
- **Done** — Završeni radni nalozi (status: completed)

Za svaki radni nalog na tabli prikazuje se:
- Naziv dijela
- Naziv proizvodnog koraka
- Referenca na proizvodni nalog
- Broj stavke

Tabla se automatski osvježava svakih 10 sekundi. Možete i ručno osvježiti klikom na dugme **"Osvježi"**.

Pristup tabli ne zahtijeva prijavu — odjel se bira iz URL-a (npr. `/departments/[id]/board`).

---

## 5. Dobavljači

Modul za upravljanje dobavljačima materijala.

### Dodavanje dobavljača

1. Kliknite **"Novi dobavljač"**
2. Popunite formu:

**Red 1:**
- **Naziv firme** — Obavezno polje
- **Šifra** — Opcionalno, interna šifra dobavljača
- **Vrsta** — Opcionalno, tip dobavljača (Pravno lice, Fizičko lice)

**Red 2:**
- **PDV status** — Opcionalno (Obveznik PDV, Nije obveznik PDV)
- **PDV broj** — Opcionalno, PDV identifikacijski broj
- **Registracija** — Opcionalno, gdje je registrovan (Federacija BiH, Republika Srpska)

**Red 3:**
- **Država** — Opcionalno, default "Bosna i Hercegovina"
- **Mjesto** — Opcionalno, grad/mjesto
- **Poštanski broj** — Opcionalno

**Red 4:**
- **Adresa** — Opcionalno, puna adresa (puna širina)

**Red 5:**
- **Kontakt email** — Opcionalno
- **Kontakt telefon** — Opcionalno

**Materijali:**
- Označite checkbox-ove pored materijala koje ovaj dobavljač snabdijeva

3. Kliknite **"Dodaj"**

Jedan materijal može imati više dobavljača, i jedan dobavljač može snabdijevati više materijala.

### Lista dobavljača

Tabela prikazuje:
- **Naziv firme** — Ime dobavljača
- **Šifra** — Interna šifra dobavljača (ako je definisana)
- **Mjesto** — Grad/mjesto dobavljača
- **Država** — Država dobavljača
- **Email** — Kontakt email
- **Telefon** — Kontakt telefon
- **Materijali** — Lista materijala koje snabdijeva (prikazani kao badge-ovi)

---

## 6. Proizvodni nalozi

Ovo je centralni modul aplikacije — ovdje se kreira i prati kompletna proizvodnja.

### Pregled naloga

Stranica prikazuje:

- **Kartice**: Ukupno naloga, U izradi, Završeno, Čeka materijal
- **Filter po statusu**: Padajući meni za filtriranje (Svi, Nacrt, Čeka materijal, Spreman, U izradi, Završen)
- **Tabela naloga**: Artikal, količina, status, progress bar, datum

### Kreiranje novog naloga

1. Kliknite **"Novi nalog"**
2. Odaberite artikal iz padajućeg menija
3. Unesite količinu (koliko komada želite proizvesti)
4. Kliknite **"Kreiraj nalog"**

Sistem automatski:
- Računa ukupne potrebe materijala na osnovu BOM-a i količine
- Provjerava da li je sav materijal na stanju
- Postavlja status na **"Spreman"** ako je sve dostupno, ili **"Čeka materijal"** ako nešto fali

### Detalji naloga

Kliknite na naziv artikla ili ikonu oka da otvorite detalje. Stranica sadrži:

#### Progress bar
Vizualni prikaz koliko je radnih naloga završeno od ukupnog broja (npr. "12 od 30 radnih naloga završeno — 40%").

#### Materijali
Tabela sa svim potrebnim materijalima:
- Koliko je potrebno, koliko je na stanju, koliki je deficit
- Zelena ikona ✅ ako je sve OK, crvena ⚠️ ako nešto fali

#### Akcije

Ovisno o statusu naloga, dostupne su različite akcije:

- **"Generiši naloge za nabavku"** (vidljivo kad status = "Čeka materijal")
  - Automatski kreira nalog za nabavku za svaki materijal koji fali
  - Popunjava količinu i predlaže dobavljača
  
- **"Pokreni proizvodnju"** (vidljivo kad status = "Spreman")
  - Generiše radne naloge za svaki proizvodni korak × dio × količina
  - Generiše jedan identifikator (barkod) po dijelu po stavci — npr. ako artikal ima 3 dijela i naručeno je 10 komada, kreira se 30 identifikatora dijela
  - Svaki identifikator dijela pokriva sve proizvodne korake za taj dio — nije potreban poseban barkod za svaki korak

#### Nalozi za nabavku
Ako postoje, prikazuje se tabela sa: materijal, količina, dobavljač, status, datum primitka.

#### Radni nalozi po odjelima
Radni nalozi grupisani po odjelima. Za svaki odjel se vidi koliko je završeno, i tabela sa svim nalozima (dio, stavka #, status, vrijeme početka/završetka).

#### Timeline — Progres po dijelovima
Vizualni prikaz napretka za svaki tip dijela:
- Progress bar po dijelu
- Numerisane kockice za svaku stavku (siva = čeka, plava = u izradi, zelena = završeno)

### Životni ciklus naloga

```
Nacrt → Čeka materijal → Spreman → U izradi → Završen
```

- **Nacrt**: Nalog je kreiran
- **Čeka materijal**: Neki materijali nedostaju
- **Spreman**: Svi materijali su dostupni, može se pokrenuti proizvodnja
- **U izradi**: Radni nalozi su generirani, proizvodnja je u toku
- **Završen**: Svi radni nalozi su završeni (automatski se mijenja)

---

## 7. Nabavka

Modul za praćenje naloga za nabavku materijala.

### Pregled

- **Kartice**: Čeka, Naručeno, Primljeno
- **Filter po statusu**
- **Tabela**: Materijal, količina, dobavljač, link na proizvodni nalog, status, datumi

### Označavanje primljenog materijala

Kad materijal stigne od dobavljača:

1. Pronađite nalog za nabavku u tabeli
2. Kliknite dugme **"Primljeno"**
3. Sistem automatski:
   - Ažurira stanje materijala na skladištu (dodaje primljenu količinu)
   - Ponovo provjerava proizvodni nalog — ako su sada svi materijali dostupni, status se mijenja u "Spreman"

### Automatsko ažuriranje statusa naloga

Sistem automatski provjerava i ažurira status proizvodnih naloga u dva slučaja:

1. **Prijem nabavke** — Kad označite materijal kao primljen, sistem provjerava sve naloge koji čekaju taj materijal. Ako su sada svi materijali dostupni, nalog automatski prelazi iz "Čeka materijal" u "Spreman".

2. **Ručno povećanje zaliha** — Kad ručno povećate količinu materijala na stranici Materijali (npr. dobili ste materijal mimo sistema nabavke), sistem isto provjerava sve naloge koji čekaju taj materijal i automatski ih ažurira.

---

## 8. Skeniranje

Modul koji koriste radnici u proizvodnji za praćenje rada putem skeniranja identifikatora dijela.

### Kako radi

1. Otvorite stranicu **"Skeniranje"**
2. Polje za unos je automatski fokusirano
3. Skenirajte identifikator USB skenerom, QR čitačem, NFC čitačem, ili bilo kojim uređajem koji emulira tastaturu
4. Ili ručno unesite vrijednost identifikatora i pritisnite Enter

### Skeniranje sa odjelom

Ako pristupate stranici za skeniranje sa URL parametrom odjela (npr. `/scan?department=id-odjela`), sistem će automatski provjeriti da li sljedeći korak pripada tom odjelu. Ako ne pripada, prikazuje se poruka sa nazivom odjela u kojem se korak treba izvršiti.

### Identifikator dijela (novi model — PT- prefiks)

Svaki fizički dio u proizvodnji ima JEDAN identifikator koji pokriva sve proizvodne korake. Sistem automatski određuje šta treba uraditi pri svakom skeniranju:

**Prvo skeniranje (prvi korak čeka):**
- Sistem automatski pokreće prvi proizvodni korak
- Prikazuje se zelena poruka: "Korak 1 od N pokrenut: [naziv koraka]"
- Zapisuje se vrijeme početka

**Skeniranje dok je korak u izradi:**
- Prikazuje se **kontrolna tačka za potvrdu završetka**
- Sistem prikazuje specifikacije: naziv dijela, dimenzije, materijale, naziv koraka, instrukcije
- Kliknite **"Potvrdi završetak"** da završite trenutni korak
- Ili kliknite **"Otkaži"** ako nešto nije u redu

**Skeniranje nakon potvrde završetka:**
- Sistem automatski pokreće sljedeći korak u nizu
- Prikazuje se poruka o pokretanju sljedećeg koraka

**Skeniranje kad je korak blokiran:**
- Ako prethodni korak nije završen, prikazuje se crvena poruka
- Poruka sadrži naziv blokirajućeg koraka i odjel u kojem se radi

**Skeniranje kad su svi koraci završeni:**
- Prikazuje se zelena poruka: "Svi koraci za ovaj dio su završeni"

**Skeniranje u pogrešnom odjelu:**
- Ako je proslijeđen odjel i sljedeći korak ne pripada tom odjelu
- Prikazuje se narandžasta poruka: "Ovaj korak se radi u odjelu [naziv]"

### Progres koraka

Pri svakom skeniranju identifikatora dijela prikazuje se vizualizacija progresa svih koraka:
- Numerisane kružnice za svaki korak
- Zelena = završen, plava = u izradi, siva = čeka
- Naziv koraka ispod svake kružnice

### Detalji dijela

Za identifikator dijela prikazuju se:
- Naziv dijela i dimenzije
- PO referenca (referenca na proizvodni nalog)
- Broj stavke
- Vrijednost barkoda

### Backward kompatibilnost

Stari barkodovi radnih naloga (WO- prefiks) i dalje rade kao prije:
- Skeniranje pokreće ili završava pojedinačni radni nalog
- Nema automatskog određivanja sljedećeg koraka

### Barkod labela i štampanje

Labela za identifikator dijela sadrži:
- Sliku barkoda (Code128)
- Naziv dijela
- Dimenzije (ako su definirane)
- Referencu na proizvodni nalog
- Redni broj stavke

Kliknite **"Štampaj labelu"** da otvorite prozor za štampanje.

### Batch štampanje etiketa

Za štampanje svih etiketa jednog proizvodnog naloga odjednom, koristi se endpoint:
`GET /api/production-orders/[id]/labels`

Ovo vraća sve identifikatore dijela sa generisanim etiketama za cijeli nalog.

---

## 9. Izvještaji

Modul za analizu proizvodnih vremena i statistika.

### Kartice sa ukupnim statistikama

- **Ukupno završeno** — Broj završenih radnih naloga
- **Prosječno vrijeme** — Prosječno trajanje radnog naloga (svi odjeli)
- **Aktivni odjeli** — Broj odjela sa radnim nalozima

### Tab "Po odjelu"

Tabela sa prosječnim vremenom proizvodnje za svaki odjel:
- Naziv odjela
- Broj završenih naloga
- Prosječno vrijeme (npr. "2h 15min")

### Tab "Po tipu dijela"

Tabela sa prosječnim vremenom za svaki tip dijela:
- Naziv dijela (npr. "Metalna konstrukcija", "Presvlaka")
- Broj završenih naloga
- Prosječno vrijeme

### Pregled odjela

Detaljna tabela sa brojem radnih naloga po statusu za svaki odjel:
- Ukupno, Čeka, U izradi, Završeno, Prosječno vrijeme

---

## Tipičan tok rada (od narudžbe do gotovog proizvoda)

### Korak 1: Priprema sistema (jednokratno)

1. **Kreirajte odjele**: Metal, Tapacirung, Montaža, Lakiranje...
2. **Dodajte materijale**: Drvo, tkanina, metal, vijci, ljepilo... sa jedinicama i minimalnim količinama
3. **Dodajte dobavljače**: Firme od kojih nabavljate materijale, sa linkovima na materijale
4. **Definirajte artikle**: Kreirajte artikal (npr. "Krevet Lux 200x160") i u BOM editoru dodajte sve dijelove sa materijalima

### Korak 2: Kreiranje proizvodnog naloga

1. Idite na **Proizvodni nalozi** → **Novi nalog**
2. Odaberite artikal i unesite količinu (npr. 10 komada)
3. Sistem provjerava materijale:
   - Ako je sve na stanju → Status: **Spreman**
   - Ako nešto fali → Status: **Čeka materijal**

### Korak 3: Nabavka (ako je potrebna)

1. Otvorite detalje naloga
2. Kliknite **"Generiši naloge za nabavku"**
3. Idite na **Nabavka** — vidite listu materijala za naručivanje
4. Kad materijal stigne, kliknite **"Primljeno"**
5. Sistem automatski ažurira stanje i provjerava nalog

### Korak 4: Pokretanje proizvodnje

1. Kad je nalog **"Spreman"**, otvorite detalje
2. Kliknite **"Pokreni proizvodnju"**
3. Sistem generiše radne naloge za svaki proizvodni korak × dio × količina
4. Sistem generiše jedan identifikator (barkod) po dijelu po stavci
5. Odštampajte etikete i zalijepite ih na fizičke dijelove

### Korak 5: Rad u proizvodnji

1. Radnik u odjelu otvara stranicu **Skeniranje** (opciono sa parametrom odjela: `/scan?department=id`)
2. Skenira identifikator dijela → Sistem automatski pokreće prvi/sljedeći korak i prikazuje progres
3. Kad završi korak, ponovo skenira isti identifikator → Prikazuje se **kontrolna tačka** sa specifikacijama
4. Radnik provjerava specifikacije i klikne **"Potvrdi završetak"** → Korak se završava
5. Ponovnim skeniranjem istog identifikatora, sistem automatski pokreće sljedeći korak
6. Proces se ponavlja dok svi koraci za taj dio nisu završeni
7. Voditelj odjela može pratiti stanje na **Tabli odjela** (Kanban prikaz)

### Korak 6: Praćenje i izvještaji

- Na **Početnoj stranici** pratite ukupan status
- U **Detaljima naloga** pratite progress po odjelima i dijelovima
- U **Izvještajima** analizirate prosječna vremena po odjelu i tipu dijela

---

## Statusi u sistemu

### Proizvodni nalog

| Status | Značenje | Boja |
|--------|----------|------|
| Nacrt | Nalog je kreiran | Siva |
| Čeka materijal | Neki materijali nedostaju | Crvena |
| Spreman | Svi materijali dostupni, spreman za proizvodnju | Bijela/outline |
| U izradi | Radni nalozi su generirani, proizvodnja u toku | Plava |
| Završen | Svi radni nalozi završeni | Siva |

### Radni nalog

| Status | Značenje | Boja |
|--------|----------|------|
| Čeka | Čeka da radnik započne | Bijela/outline |
| U izradi | Radnik je skenirao barkod, rad u toku | Plava |
| Završen | Radnik je ponovo skenirao, rad završen | Siva |

### Nalog za nabavku

| Status | Značenje |
|--------|----------|
| Čeka | Kreiran, čeka naručivanje |
| Naručeno | Naručeno kod dobavljača |
| Primljeno | Materijal je stigao i stanje je ažurirano |

---

## Barkod sistem — Detalji

### Tipovi identifikatora

1. **Identifikator dijela (PT- prefiks)** — Generiše se za svaki dio × svaku stavku pri pokretanju proizvodnje. Jedan identifikator pokriva sve proizvodne korake za taj dio. Ovo je novi, preporučeni model.
2. **Barkod radnog naloga (WO- prefiks)** — Stari model, generiše se za svaki pojedinačni radni nalog. Zadržan za backward kompatibilnost sa postojećim nalozima.
3. **Barkod gotovog proizvoda (PR- prefiks)** — Generiše se automatski kad su svi dijelovi jedne stavke završeni.

### Podržane tehnologije

Sistem podržava bilo koji uređaj ili tehnologiju za očitavanje identifikatora:
- USB barkod skeneri (HID uređaji koji emuliraju tastaturu)
- QR čitači
- NFC čitači
- RFID čitači
- Ručni unos putem tastature

Vrijednost identifikatora se tretira kao tekstualni string — nije bitno kojom tehnologijom je očitan.

### Štampanje labela

Labela za identifikator dijela sadrži:
- Sliku barkoda (Code128)
- Naziv dijela
- Dimenzije (ako su definirane)
- Referencu na proizvodni nalog
- Redni broj stavke

Kliknite "Štampaj labelu" da otvorite prozor za štampanje. Možete koristiti bilo koji printer, uključujući termalne printere za labele.

---

## Česta pitanja

**P: Šta ako skeniram barkod koji ne postoji?**
O: Sistem prikazuje crvenu poruku "Barkod nije pronađen".

**P: Šta je identifikator dijela i po čemu se razlikuje od starog barkoda?**
O: Identifikator dijela (PT- prefiks) je jedan barkod koji pokriva sve proizvodne korake za jedan fizički dio. Stari model je imao poseban barkod za svaki korak. Sa novim modelom, radnik skenira isti identifikator za svaki korak — sistem automatski određuje šta treba uraditi.

**P: Šta ako skeniram identifikator dijela u pogrešnom odjelu?**
O: Ako je stranica za skeniranje otvorena sa parametrom odjela, sistem će prikazati poruku "Ovaj korak se radi u odjelu X" i neće pokrenuti korak.

**P: Šta je Tabla odjela?**
O: Tabla odjela je Kanban prikaz svih radnih naloga za jedan odjel, organizovan u tri kolone: To Do, In Progress, Done. Automatski se osvježava svakih 10 sekundi. Pristupate joj na `/departments/[id]/board`.

**P: Da li stari barkodovi i dalje rade?**
O: Da, stari barkodovi radnih naloga (WO- prefiks) i dalje rade kao prije. Novi identifikatori dijela (PT- prefiks) se generišu samo za nove proizvodne naloge.

**P: Kako da odštampam sve etikete za jedan proizvodni nalog?**
O: Koristite batch endpoint `GET /api/production-orders/[id]/labels` koji vraća sve etikete za cijeli nalog odjednom.

**P: Mogu li ručno promijeniti status radnog naloga?**
O: Ne, status se mijenja isključivo skeniranjem identifikatora dijela (ili starog barkoda radnog naloga). Sistem automatski određuje koji korak treba pokrenuti ili završiti.

**P: Šta se dešava kad se svi radni nalozi završe?**
O: Proizvodni nalog automatski dobija status "Završen" i generiše se barkod za gotov proizvod.

**P: Mogu li kreirati proizvodni nalog ako nemam dovoljno materijala?**
O: Da, nalog se kreira sa statusom "Čeka materijal". Možete generisati naloge za nabavku i nastaviti kad materijal stigne.

**P: Kako da vidim koji materijali su na niskim zalihama?**
O: Na Početnoj stranici vidite broj materijala ispod minimuma. Na stranici Materijali, materijali sa niskim zalihama imaju crveni badge "Niske zalihe".

**P: Mogu li jedan materijal povezati sa više dobavljača?**
O: Da, pri kreiranju dobavljača označite materijale koje snabdijeva. Isti materijal može biti kod više dobavljača.

**P: Šta su napomene/instrukcije na dijelovima artikla?**
O: To su specifične upute za proizvodnju svakog dijela (npr. "Koristiti bijelu tkaninu", "Dupli šav"). Definišu se u BOM editoru artikla i prikazuju se radnicima kad skeniraju barkod i na štampanim labelama.

**P: Zašto moram potvrditi završetak radnog naloga?**
O: Kontrolna tačka prikazuje sve specifikacije dijela (dimenzije, napomene, materijale) tako da radnik može provjeriti da je sve urađeno kako treba prije nego označi posao kao završen. Ovo smanjuje greške u proizvodnji.

**P: Šta ako radnik otkaže potvrdu završetka?**
O: Radni nalog ostaje u statusu "U izradi". Radnik može ponovo skenirati barkod kad bude spreman za potvrdu.

✅ Multi-article nalozi — jedan nalog može sadržavati više različitih artikala
✅ Prioriteti — hitan/normalan/nizak sa vizuelnim indikatorima
✅ Rokovi isporuke — praćenje i upozorenja za kašnjenje
✅ Kalkulacija troškova — automatski proračun troškova materijala i marže
✅ Revizijski dnevnik — potpuno praćenje svih akcija u sistemu
✅ Historija zaliha — detaljan pregled promjena sa grafikonom
✅ Štampa — profesionalne procedure za proizvodnju i odjele sa barkodovima
✅ Šifre i cijene materijala — bolje upravljanje inventarom
✅ Materijali po koracima — preciznija specifikacija proizvodnj