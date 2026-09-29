# Mobil Legend API

Backend REST untuk katalog mobil bekas, dibangun dengan NestJS, PostgreSQL, dan Prisma ORM. Semua endpoint mobil dilindungi JWT.

## Prasyarat

- Node.js 22 atau lebih baru
- PostgreSQL 15 atau lebih baru, atau Docker

## Menjalankan Project

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

Server berjalan di `http://localhost:3000`. Dokumentasi OpenAPI interaktif tersedia di `http://localhost:3000/docs`.

Kredensial awal:

- Username: `admin`
- Password: `admin123`

Ganti `JWT_SECRET`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` melalui `.env` sebelum deployment. File gambar disimpan dalam folder lokal `uploads`; production sebaiknya menggunakan object storage persisten.

## Endpoint

| Method | Path | Operation ID | Keterangan |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | `login` | Mendapatkan bearer token |
| GET | `/api/v1/cars` | `get_cars` | List, pagination, pencarian, filter tahun |
| GET | `/api/v1/cars/:id` | `get_car_detail` | Detail mobil dan semua gambar |
| POST | `/api/v1/cars/bulk` | `add_car` | Tambah 1-20 mobil sekaligus |
| PATCH | `/api/v1/cars/:id` | `update_car` | Ubah data, tambah/hapus gambar |
| DELETE | `/api/v1/cars/:id` | `delete_car` | Hapus mobil |

Query `get_cars`: `page` (default 1), `perpage` (default 10, maksimal 100), `name`, `start_year`, dan `end_year`.

### Format Add Car

Gunakan `multipart/form-data`. Field `cars` berisi array JSON maksimal 20 item:

```json
[
  {
    "name": "Avanza Veloz",
    "manufacturer": "Toyota",
    "year": 2022,
    "price": 275000000,
    "description": "Kondisi terawat"
  }
]
```

Gambar item pertama dikirim menggunakan field `images_0`, item kedua `images_1`, dan seterusnya. Setiap item menerima maksimal lima file PNG/JPG, masing-masing maksimal 2 MB.

### Format Update Car

Gunakan `multipart/form-data`. Semua field opsional. Tambahkan file dengan field `images`; hapus gambar dengan `removeImageIds` berupa array JSON UUID, misalnya `["image-uuid"]`. Total gambar setelah perubahan maksimal lima.

## Postman

Import [postman/Mobil Legend API.postman_collection.json](postman/Mobil%20Legend%20API.postman_collection.json). Jalankan request **Login** terlebih dahulu; script koleksi otomatis menyimpan token. Request **Add Cars** otomatis menyimpan ID mobil pertama untuk request detail, update, dan delete.

## Validasi

```bash
npm run build
```