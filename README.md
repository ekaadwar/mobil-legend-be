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

### Atribut Tambahan Mobil

Semua atribut berikut opsional dan nullable pada bulk maupun update. Jika tidak dikirim saat membuat mobil, nilainya `null` (termasuk status, tanpa default).

| Atribut | Penyimpanan | Format / batas |
| --- | --- | --- |
| `status` | VARCHAR(10) + CHECK | `ready`, `pending`, `reserve`, `sold` |
| `transmission` | VARCHAR(100) | Jenis transmisi |
| `mileage` | INTEGER | Kilometer bulat, 0-2147483647 |
| `fuel` | VARCHAR(100) | Jenis bahan bakar |
| `registration_number` | VARCHAR(30) | Nomor polisi |
| `validity_period` | DATE | Tanggal valid `YYYY-MM-DD`, tanpa waktu |
| `showroom_name` | VARCHAR(150) | Nama showroom |
| `showroom_address` | TEXT | Alamat lengkap showroom |

GET `/api/v1/cars` menambahkan `status`, `transmission`, `mileage`, dan `validity_period` pada setiap item. GET `/api/v1/cars/:id` serta response bulk/update memuat seluruh delapan atribut. Field lama tetap tersedia.

Untuk database yang sudah ada, jalankan `npx prisma migrate deploy` dan `npx prisma generate`, lalu restart backend. Migrasi menambahkan kolom tanpa menghapus data lama. Constraint status dan mileage didefinisikan pada SQL migrasi karena tidak direpresentasikan sebagai Prisma enum.

### Format Add Car

Gunakan `multipart/form-data`. Field `cars` berisi array JSON maksimal 20 item:

```json
[
  {
    "name": "Avanza Veloz",
    "manufacturer": "Toyota",
    "year": 2022,
    "price": 275000000,
    "description": "Kondisi terawat",
    "status": "ready",
    "transmission": "Automatic",
    "mileage": 45000,
    "fuel": "Bensin",
    "registration_number": "B 1234 ABC",
    "validity_period": "2027-10-07",
    "showroom_name": "Mobil Legend Jakarta",
    "showroom_address": "Jl. Sudirman No. 10, Jakarta"
  }
]
```

Gambar item pertama dikirim menggunakan field `images_0`, item kedua `images_1`, dan seterusnya. Setiap item menerima maksimal lima file PNG/JPG, masing-masing maksimal 2 MB.

### Format Update Car

Gunakan `multipart/form-data`. Semua field opsional. Tambahkan file dengan field `images`; hapus gambar dengan `removeImageIds` berupa array JSON UUID, misalnya `["image-uuid"]`. Total gambar setelah perubahan maksimal lima.

Untuk memperbarui data tanpa mengubah gambar, jangan kirim `images` dan `removeImageIds`. Jika Swagger mengirim field kosong, backend juga menerimanya: `images` kosong diabaikan dan `removeImageIds` kosong dianggap `[]`. Tidak ada gambar lama yang dihapus. `images` berisi teks nonkosong tetap ditolak; penambahan gambar harus berupa file upload.

Field tambahan yang tidak dikirim tidak berubah. Untuk mengosongkan nilainya pada form-data, kirim teks `null` atau string kosong. Pada array JSON bulk, gunakan nilai JSON `null`. Nilai `mileage` nol tetap disimpan sebagai `0`, bukan `null`.

## Postman

Import [postman/Mobil Legend API.postman_collection.json](postman/Mobil%20Legend%20API.postman_collection.json). Jalankan request **Login** terlebih dahulu; script koleksi otomatis menyimpan token. Request **Add Cars** otomatis menyimpan ID mobil pertama untuk request detail, update, dan delete.

## Validasi

```bash
npm run build
npm test -- --runInBand
```