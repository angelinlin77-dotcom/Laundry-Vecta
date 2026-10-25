# Sistem Informasi Laundry (UTS PBAD)

Satu REST API Node.js dipakai oleh Web Client React TypeScript. Mobile dan Desktop memakai API yang sama pada UAS.

## Struktur

- `api/` REST API Node.js tanpa dependensi (modul bawaan). Data disimpan di `api/data.json`, dibuat otomatis dari `api/seed.json`.
- `web/` Web Client React + TypeScript + Vite.
- `docs/` Dokumen Master (dibuat di Claude Docs, ekspor ke PDF).

## Menjalankan

Butuh Node.js 18 atau lebih baru.

```bash
# Terminal 1: API di http://localhost:3000
cd api
npm start
npm test      # opsional: pengujian CRUD

# Terminal 2: Web di http://localhost:5173
cd web
npm install
npm run dev
```

Bila API berjalan di alamat lain, salin `web/.env.example` menjadi `web/.env` dan ubah `VITE_API_URL`.

Untuk mengembalikan data awal, hapus `api/data.json` lalu jalankan ulang API.
