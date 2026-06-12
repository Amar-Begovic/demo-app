# Upute za skeniranje barkodova

## Kako koristiti

1. Otvorite link za vaš odjel na mobilnom telefonu
2. Kamera se automatski otvara — usmjerite je na barkod
3. Zeleni ekran = uspješno, crveni = greška
4. Skener se automatski nastavlja nakon svakog skeniranja
5. Ako kamera ne radi, možete ručno unijeti barkod

## Linkovi za skeniranje po odjelu

| Odjel | Link |
|-------|------|
| BRAVARI | `https://demo-app.vercel.app/m/b1fa4ea8-2eea-49ec-9491-14e0a704644f` |
| KROJENJE | `https://demo-app.vercel.app/m/752502b4-8870-4f52-a27f-f439adc1b416` |
| MONTAZA | `https://demo-app.vercel.app/m/1d276536-b729-4670-85f8-6931580f3520` |
| NOGICE | `https://demo-app.vercel.app/m/2b5bc90f-5d68-4fd2-9f13-07b489ac7c1e` |
| PAKOVANJE ZALIHA | `https://demo-app.vercel.app/m/e0e0caaa-4f4e-47ab-9c82-61fb37a5b01d` |
| PRIPREMA NA BIJELO | `https://demo-app.vercel.app/m/6c616913-7526-4148-ad43-312411bf3963` |
| SIVENJE | `https://demo-app.vercel.app/m/5d3b114b-df80-4e9d-8a78-85a927a58ecf` |
| SKIVANJE METALNIH BAZA | `https://demo-app.vercel.app/m/87b0958e-478a-4772-a433-24dae55fa3b0` |
| STEPANJE MADRACI I OKOLICA | `https://demo-app.vercel.app/m/55da026e-7554-4187-9bce-3cbaa968fc9a` |
| STEPANJE UZGLAVLJA | `https://demo-app.vercel.app/m/73b5989b-c747-4f37-9266-d0502e5be8c1` |
| STROLARI | `https://demo-app.vercel.app/m/6daaf78d-6997-4815-b686-748c8654c3a6` |

## Napomene

- Telefon vibrira kratko pri uspješnom skeniranju, duplo pri grešci
- Ako se traži potvrda završetka, skener pauzira dok ne potvrdite ili otkažete
- Dugme "X" zatvara kameru i prebacuje na ručni unos
- Dugme "Otvori kameru" ponovo aktivira kameru

## Rute aplikacije

### Skener (mobilni)

| Ruta | Opis |
|------|------|
| `/m/[departmentId]` | Mobilni skener za odjel — otvara kameru, skenira barkodove radnih naloga |

### Štampa (desktop)

| Ruta | Opis |
|------|------|
| `/production/[id]/print` | Print za odjele — svaki odjel na zasebnoj stranici sa koracima, materijalima i barkodovima |
| `/production/[id]/print/order` | Pregled naloga — sumarni prikaz artikala, dijelova, količina |
| `/production/[id]/print/radni-nalog` | Radni nalog — tabelarni format sa product barkodovima za utovar |
