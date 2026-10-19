/// <reference types="jest" />

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import request = require('supertest');
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { parseBulkCars } from './car-upload';
import { CarsController } from './cars.controller';
import { CarImagesController } from './car-images.controller';
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
  color: 'Silver Metallic',
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
  color: additionalInput.color,
  transmission: additionalInput.transmission,
  mileage: additionalInput.mileage,
  fuel: additionalInput.fuel,
  registrationNumber: additionalInput.registration_number,
  validityPeriod: new Date('2028-02-29T00:00:00.000Z'),
  showroomName: additionalInput.showroom_name,
  showroomAddress: additionalInput.showroom_address,
  createdAt: new Date('2026-10-13T00:00:00.000Z'),
  updatedAt: new Date('2026-10-13T00:00:00.000Z'),
  images: [],
} satisfies Prisma.CarGetPayload<{ include: { images: true } }>;

describe('Car image highlight endpoint', () => {
  let app: INestApplication;
  let authorization: string;
  const image = {
    id: 'edb94b14-c065-4b82-a8bf-a8294971bbbd',
    carId: record.id,
    url: '/uploads/highlight.jpg',
    highlight: false,
  };
  const transaction = {
    carImage: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const prisma = { $transaction: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'highlight-test-only-secret' })],
      controllers: [CarImagesController],
      providers: [CarsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    authorization = `Bearer ${app.get(JwtService).sign({ sub: 'admin' })}`;
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation) => operation(transaction));
    transaction.carImage.findUnique.mockResolvedValue(image);
    transaction.$queryRaw.mockResolvedValue([{ id: image.carId }]);
    transaction.carImage.updateMany.mockResolvedValue({ count: 2 });
    transaction.carImage.update.mockResolvedValue({ id: image.id, url: image.url, highlight: true });
  });

  afterAll(async () => { await app.close(); });

  it('selects one image and clears siblings in a single locked transaction without a body', async () => {
    const response = await request(app.getHttpServer()).patch(`/api/v1/car-images/${image.id}`)
      .set('Authorization', authorization).expect(200);
    expect(response.body).toEqual({ id: image.id, url: image.url, highlight: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.carImage.findUnique).toHaveBeenCalledWith({ where: { id: image.id } });
    expect(transaction.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(transaction.$queryRaw.mock.calls[0][1]).toBe(image.carId);
    expect(transaction.carImage.updateMany).toHaveBeenCalledWith({
      where: { carId: image.carId, id: { not: image.id } }, data: { highlight: false },
    });
    expect(transaction.carImage.update).toHaveBeenCalledWith({
      where: { id: image.id }, data: { highlight: true }, select: { id: true, url: true, highlight: true },
    });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(transaction.carImage.updateMany.mock.invocationCallOrder[0]);
  });

  it('returns 404 without mutating other images when the ID is missing', async () => {
    transaction.carImage.findUnique.mockResolvedValue(null);
    const response = await request(app.getHttpServer()).patch(`/api/v1/car-images/${image.id}`)
      .set('Authorization', authorization).expect(404);
    expect(response.body).toMatchObject({ statusCode: 404, message: 'Gambar mobil tidak ditemukan' });
    expect(transaction.carImage.updateMany).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed UUID before accessing the database', async () => {
    await request(app.getHttpServer()).patch('/api/v1/car-images/not-a-uuid')
      .set('Authorization', authorization).expect(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer invalid'])('requires a valid token (%p)', async (token) => {
    const patch = request(app.getHttpServer()).patch(`/api/v1/car-images/${image.id}`);
    if (token) patch.set('Authorization', token);
    await patch.expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates write failures so the transaction rolls back', async () => {
    transaction.carImage.update.mockRejectedValue(new Error('write failed'));
    await expect(app.get(CarsService).highlightImage(image.id)).rejects.toThrow('write failed');
  });

  it('returns 404 if the selected image is deleted during the operation', async () => {
    transaction.carImage.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Record not found', { code: 'P2025', clientVersion: '6.12.0' },
    ));
    await request(app.getHttpServer()).patch(`/api/v1/car-images/${image.id}`)
      .set('Authorization', authorization).expect(404);
  });

  it('documents the protected endpoint and its image response', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
    const operation = document.paths['/api/v1/car-images/{id}'].patch;
    expect(operation?.security).toEqual([{ bearer: [] }]);
    expect(operation?.requestBody).toBeUndefined();
    expect(document.components?.schemas?.CarImageDto).toMatchObject({
      properties: { highlight: { type: 'boolean' } },
    });
    expect(operation?.responses['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/CarImageDto' } } },
    });
  });
});

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
      for (const schemaName of ['CarListResponseDto', 'CarResponseDto']) {
        expect(document.components?.schemas?.[schemaName]).toMatchObject({
          properties: {
            images: { type: 'array', items: { $ref: '#/components/schemas/CarImageDto' } },
            color: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
          },
        });
      }
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
    highlight: false,
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
    expect(response.body.images).toEqual([{ id: image.id, url: image.url, highlight: false }]);
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
    { color: 'x'.repeat(101) },
    { color: 123 },
    { highlight: true },
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
    expect((await validate(plainToInstance(UpdateCarDto, fields), {
      whitelist: true, forbidNonWhitelisted: true,
    })).length).toBeGreaterThan(0);
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

  it('uses the same image response shape in list, detail, bulk and car update without filtering images', async () => {
    const images = [true, false].map((highlight, index) => ({
      id: `image-${index}`,
      carId: record.id,
      filename: `image-${index}.jpg`,
      url: `/uploads/image-${index}.jpg`,
      highlight,
      createdAt: record.createdAt,
    }));
    const withImages = { ...record, images };
    prisma.car.findMany.mockResolvedValue([withImages]);
    prisma.car.findUnique.mockResolvedValue(withImages);
    prisma.car.create.mockResolvedValue(withImages);
    prisma.car.update.mockResolvedValue(withImages);
    const page = await service.findAll(new CarsQueryDto());
    const detail = await service.findOne(record.id);
    const created = await service.createMany([{ ...baseInput, ...additionalInput }]);
    const updated = await service.update(record.id, { color: null });
    const expected = images.map(({ id, url, highlight }) => ({ id, url, highlight }));
    for (const car of [page.data[0], detail, created[0], updated]) {
      expect(car.images).toEqual(expected);
    }
    expect(prisma.car.update.mock.calls[0][0].data.color).toBeNull();
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
      status: null, color: null, transmission: null, mileage: null, fuel: null,
      registrationNumber: null, validityPeriod: null, showroomName: null, showroomAddress: null,
    });
  });

  it('serializes nullable records without dropping fields', async () => {
    prisma.car.findUnique.mockResolvedValue({
      ...record,
      status: null, color: null, transmission: null, mileage: null, fuel: null,
      registrationNumber: null, validityPeriod: null, showroomName: null, showroomAddress: null,
    });
    const detail = await service.findOne(record.id);
    for (const field of Object.keys(additionalInput)) {
      expect(detail).toHaveProperty(field, null);
    }
  });
});