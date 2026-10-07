ALTER TABLE "cars"
ADD COLUMN "status" VARCHAR(10),
ADD COLUMN "transmission" VARCHAR(100),
ADD COLUMN "mileage" INTEGER,
ADD COLUMN "fuel" VARCHAR(100),
ADD COLUMN "registration_number" VARCHAR(30),
ADD COLUMN "validity_period" DATE,
ADD COLUMN "showroom_name" VARCHAR(150),
ADD COLUMN "showroom_address" TEXT,
ADD CONSTRAINT "cars_status_check" CHECK ("status" IN ('ready', 'pending', 'reserve', 'sold')),
ADD CONSTRAINT "cars_mileage_check" CHECK ("mileage" >= 0);