# Vocabulary Journey

Mobil uyumlu kelime takip uygulamasi.

## Ozellikler

- Google ile giris (Firebase Auth)
- Veri saklama (Firestore + localStorage fallback)
- Her kelime icin 10 gunluk cumle takibi
- Bugun cumlesi yazilmayan kelimeler icin kategori bazli bildirim rozeti
- Kelime/meaning/cumle tasmalarina karsi responsive metin kirma

## Kurulum

1. `.env.example` dosyasini `.env.local` olarak kopyala.
2. Firebase proje bilgilerini doldur.
3. Asagidaki komutlari calistir:

```bash
npm install
npm run dev
```

## Firebase ayarlari

- Authentication > Sign-in method > Google aktif et.
- Firestore Database olustur.
- Baslangic icin test kurali:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Build

```bash
npm run build
```
