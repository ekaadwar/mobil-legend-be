import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { parseBulkCars } from './car-upload';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { CarStatus, CarsQueryDto, UpdateCarDto } from './dto/car.dto';

const baseInput = {
  name: 'Avanza Veloz',
  manufacturer: 'Toyota',
  year: 2022,
  price: 275000000,
};

const additionalInput = {
  status: CarStatus.READY,
  transmission: 'Automatic',
  mileage: 45000,
  fuel: 'Bensin',
  registration_number: 'B 1234 ABC',
  validity_period: '2028-02-29',
  showroom_name: 'Mobil Legend Jakarta',
  showroom_address: 'Jl. Sudirman No. 10, Jakarta',
};

const record = {
  id: '6d3d700a-3abe-4ef0-bdd3-37ff204f52c5',
  ...baseInput,
  price: BigInt(baseInput.price),
  description: null,
  status: additionalInput.status,
  transmission: additionalInput.transmission,
  mileage: additionalInput.mileage,
  fuel: additionalInput.fuel,
  registrationNumber: additionalInput.registration_number,
  validityPeriod: new Date('2028-02-29T00:00:00.000Z'),
  showroomName: additionalInput.showroom_name,
  showroomAddress: additionalInput.showroom_address,
  images: [],
};

describe('Car list Swagger parameters', () => {
  it('documents pagination as scalar integers instead of JSON objects', async () => {
    const module = await Test.createTestingModule({
      controllers: [CarsController],
      providers: [{ provide: CarsService, useValue: {} }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    try {
      await app.init();
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      const parameters = document.paths['/api/v1/cars'].get?.parameters;
      expect(parameters).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'page', in: 'query', required: false,
          schema: expect.objectContaining({ type: 'integer', default: 1, minimum: 1 }) }),
        expect.objectContaining({ name: 'perpage', in: 'query', required: false,
          schema: expect.objectContaining({ type: 'integer', default: 10, minimum: 1, maximum: 100 }) }),
        expect.objectContaining({ name: 'name', schema: expect.objectContaining({ type: 'string' }) }),
        expect.objectContaining({ name: 'start_year', schema: expect.objectContaining({ type: 'number' }) }),
        expect.objectContaining({ name: 'end_year', schema: expect.objectContaining({ type: 'number' }) }),
      ]));
    } finally {
      await app.close();
    }
  });
});

describe('Car PATCH optional image fields', () => {
  let app: INestApplication;
  const image = {
    id: 'edb94b14-c065-4b82-a8bf-a8294971bbbd',
    filename: 'existing-car-image.jpg',
    url: '/uploads/existing-car-image.jpg',
  };
  const prisma = { car: { findUnique: jest.fn(), update: jest.fn() } };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CarsController],
      providers: [CarsService, { provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.car.findUnique.mockResolvedValue({ ...record, images: [image] });
    prisma.car.update.mockResolvedValue({ ...record, status: 'sold', images: [image] });
  });

  afterAll(async () => { await app.close(); });

  it.each([undefined, '', '[]'])('preserves existing images with removeImageIds=%p', async (removeImageIds) => {
    let patch = request(app.getHttpServer()).patch(`/api/v1/cars/${record.id}`);
    for (const [field, value] of Object.entries({ ...additionalInput, status: 'sold' })) {
      patch = patch.field(field, String(value));
    }
    if (removeImageIds !== undefined) {
      patch = patch.field('removeImageIds', removeImageIds).field('images', '');
    }
    const response = await patch.expect(200);
    expect(response.body.status).toBe('sold');
    expect(response.body.images).toEqual([{ id: image.id, url: image.url }]);
    const data = prisma.car.update.mock.calls[0][0].data;
    expect(data.images).toEqual({ deleteMany: { id: { in: [] } }, create: [] });
    expect(data).not.toHaveProperty('removeImageIds');
    expect(data.name).toBeUndefined();
    expect(data.price).toBeUndefined();
  });

  it.each([
    ['removeImageIds', 'not-json'],
    ['removeImageIds', '{}'],
    ['removeImageIds', '["not-a-uuid"]'],
    ['images', 'not-a-file'],
    ['showtoom_address', 'Unknown field'],
  ])('rejects invalid %s=%s', async (field, value) => {
    await request(app.getHttpServer()).patch(`/api/v1/cars/${record.id}`)
      .field('status', 'sold').field(field, value).expect(400);
    expect(prisma.car.update).not.toHaveBeenCalled();
  });

  it('still parses explicit image removal IDs', async () => {
    const input = plainToInstance(UpdateCarDto, { removeImageIds: JSON.stringify([image.id]) });
    expect(await validate(input, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(input.removeImageIds).toEqual([image.id]);
  });
});

describe('Car additional input validation', () => {
  it.each(Object.values(CarStatus))('accepts status %s in bulk', async (status) => {
    const [input] = await parseBulkCars(JSON.stringify([{ ...baseInput, ...additionalInput, status }]));
    expect(input).toMatchObject({ ...additionalInput, status });
  });

  it('accepts legacy bulk input without additional fields', async () => {
    const [input] = await parseBulkCars(JSON.stringify([baseInput]));
    for (const field of Object.keys(additionalInput)) {
      expect(input).toHaveProperty(field, undefined);
    }
  });

  it.each([null, 'null', ''])('normalizes nullable fields with value %p', async (value) => {
    const fields = Object.fromEntries(Object.keys(additionalInput).map((field) => [field, value]));
    const [created] = await parseBulkCars(JSON.stringify([{ ...baseInput, ...fields }]));
    const updated = plainToInstance(UpdateCarDto, fields);
    expect(await validate(updated)).toHaveLength(0);
    for (const field of Object.keys(fields)) {
      expect(created).toHaveProperty(field, null);
      expect(updated).toHaveProperty(field, null);
    }
  });

  it('preserves omitted PATCH fields and converts zero mileage without making it null', async () => {
    const input = plainToInstance(UpdateCarDto, { mileage: '0' });
    expect(await validate(input)).toHaveLength(0);
    expect(input.mileage).toBe(0);
    expect(input.status).toBeUndefined();
    expect(input.validity_period).toBeUndefined();
  });

  it.each([
    { status: 'available' },
    { mileage: -1 },
    { mileage: 1.5 },
    { mileage: 2147483648 },
    { mileage: true },
    { mileage: 'abc' },
    { validity_period: '2027-02-29' },
    { validity_period: '2028-02-30' },
    { validity_period: '07-10-2027' },
    { validity_period: '2027-10-07T00:00:00Z' },
    { transmission: 'x'.repeat(101) },
    { fuel: 'x'.repeat(101) },
    { registration_number: 'x'.repeat(31) },
    { showroom_name: 'x'.repeat(151) },
    { showroom_address: 123 },
  ])('rejects invalid bulk and PATCH input %p', async (fields) => {
    await expect(parseBulkCars(JSON.stringify([{ ...baseInput, ...fields }]))).rejects.toThrow();
    expect((await validate(plainToInstance(UpdateCarDto, fields))).length).toBeGreaterThan(0);
  });
});

describe('Car storage and response mapping', () => {
  const prisma = {
    car: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const service = new CarsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.car.findUnique.mockResolvedValue(record);
    prisma.car.findMany.mockResolvedValue([record]);
    prisma.car.count.mockResolvedValue(1);
    prisma.car.create.mockResolvedValue(record);
    prisma.car.update.mockResolvedValue(record);
    prisma.$transaction.mockImplementation(async (operation) =>
      typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
    );
  });

  it('adds only the four requested fields to list items', async () => {
    const page = await service.findAll(new CarsQueryDto());
    expect(page).toMatchObject({ page: 1, perpage: 10, total: 1, totalPages: 1 });
    expect(page.data[0]).toMatchObject({
      ...baseInput,
      status: 'ready',
      transmission: 'Automatic',
      mileage: 45000,
      validity_period: '2028-02-29',
    });
    for (const field of ['fuel', 'registration_number', 'showroom_name', 'showroom_address']) {
      expect(page.data[0]).not.toHaveProperty(field);
    }
  });

  it('returns all eight fields in detail using API names and date-only format', async () => {
    const detail = await service.findOne(record.id);
    expect(detail).toMatchObject(additionalInput);
    for (const field of ['registrationNumber', 'validityPeriod', 'showroomName', 'showroomAddress']) {
      expect(detail).not.toHaveProperty(field);
    }
  });

  it('maps bulk fields to Prisma names and a UTC date', async () => {
    const result = await service.createMany([{ ...baseInput, ...additionalInput }]);
    const data = prisma.car.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: 'ready', transmission: 'Automatic', mileage: 45000, fuel: 'Bensin',
      registrationNumber: 'B 1234 ABC', validityPeriod: record.validityPeriod,
      showroomName: record.showroomName, showroomAddress: record.showroomAddress,
    });
    expect(data).not.toHaveProperty('validity_period');
    expect(result[0]).toMatchObject(additionalInput);
  });

  it('maps PATCH fields without resetting omitted properties', async () => {
    await service.update(record.id, { status: CarStatus.SOLD, mileage: 0, validity_period: '2027-10-07' });
    const data = prisma.car.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'sold', mileage: 0, validityPeriod: new Date('2027-10-07T00:00:00.000Z') });
    expect(data.transmission).toBeUndefined();
    expect(data.showroomName).toBeUndefined();
  });

  it('passes explicit null through to every nullable database field', async () => {
    const fields = Object.fromEntries(Object.keys(additionalInput).map((field) => [field, null]));
    await service.update(record.id, fields);
    expect(prisma.car.update.mock.calls[0][0].data).toMatchObject({
      status: null, transmission: null, mileage: null, fuel: null,
      registrationNumber: null, validityPeriod: null, showroomName: null, showroomAddress: null,
    });
  });

  it('serializes nullable records without dropping fields', async () => {
    prisma.car.findUnique.mockResolvedValue({
      ...record,
      status: null, transmission: null, mileage: null, fuel: null,
      registrationNumber: null, validityPeriod: null, showroomName: null, showroomAddress: null,
    });
    const detail = await service.findOne(record.id);
    for (const field of Object.keys(additionalInput)) {
      expect(detail).toHaveProperty(field, null);
    }
  });
});