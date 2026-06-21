# Prisma — Testing: Mock y Testing con Base de Datos Real

## Fuentes

- jest-mock-extended: https://github.com/marchaos/jest-mock-extended
- Prisma Unit Testing: https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing
- Prisma Integration Testing: https://www.prisma.io/docs/orm/prisma-client/testing/integration-testing

---

## 1. Mock de PrismaService para tests unitarios

```bash
npm install -D jest-mock-extended
```

```typescript
// test/helpers/prisma-mock.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

export type PrismaMock = DeepMockProxy<PrismaClient>;

export const createPrismaMock = (): PrismaMock => mockDeep<PrismaClient>();
```

---

## 2. Test unitario del use case de reserva

```typescript
// src/modules/reservations/application/reserve-gift.use-case.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ReserveGiftUseCase } from './reserve-gift.use-case';

describe('ReserveGiftUseCase', () => {
  let useCase: ReserveGiftUseCase;
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReserveGiftUseCase,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    useCase = module.get(ReserveGiftUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debe reservar un regalo disponible y NO exponer reservedById', async () => {
    const giftId = 'gift-123';
    const userId = 'user-456';

    // Mockear la transacción con el comportamiento esperado
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      // Mock del $queryRaw (SELECT FOR UPDATE)
      prismaMock.$queryRaw.mockResolvedValue([{
        id: giftId, estado: 'AVAILABLE', listId: 'list-789'
      }]);

      // Mock de la lista con el propietario
      prismaMock.list.findUnique.mockResolvedValue({
        ownerProfile: { ownerId: 'owner-different-user' }
      } as any);

      // Mock del update y create
      prismaMock.gift.update.mockResolvedValue({ id: giftId, estado: 'RESERVED' } as any);
      prismaMock.reservation.create.mockResolvedValue({
        id: 'res-001', giftId, reservedById: userId, reservedAt: new Date(), status: 'ACTIVE'
      } as any);

      return fn(prismaMock);
    });

    const result = await useCase.execute(giftId, userId);

    // ✅ Verificar que el resultado NO contiene reservedById
    expect(result.estado).toBe('RESERVED');
    expect(result).not.toHaveProperty('reservedById');
    expect(result).not.toHaveProperty('reservanteName');
  });

  it('debe retornar estado RESERVED sin identidad si ya estaba reservado', async () => {
    const giftId = 'gift-123';

    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      prismaMock.$queryRaw.mockResolvedValue([{
        id: giftId, estado: 'RESERVED', listId: 'list-789'
      }]);
      return fn(prismaMock);
    });

    const result = await useCase.execute(giftId, 'user-456');

    expect(result.estado).toBe('RESERVED');
    expect(result).not.toHaveProperty('reservedById');
  });

  it('debe lanzar ForbiddenException si el usuario intenta reservar su propio regalo', async () => {
    const ownerId = 'owner-user';
    const giftId = 'gift-123';

    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      prismaMock.$queryRaw.mockResolvedValue([{
        id: giftId, estado: 'AVAILABLE', listId: 'list-789'
      }]);
      prismaMock.list.findUnique.mockResolvedValue({
        ownerProfile: { ownerId }   // El viewer ES el propietario
      } as any);
      return fn(prismaMock);
    });

    await expect(useCase.execute(giftId, ownerId))
      .rejects.toThrow(ForbiddenException);
  });
});
```

---

## 3. Test de integración con base de datos real (Testcontainers)

```bash
npm install -D @testcontainers/postgresql testcontainers
```

```typescript
// test/integration/reservations.integration.spec.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

describe('ReservationsModule (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();

    const dbUrl = container.getConnectionUri();
    process.env.DATABASE_URL = dbUrl;

    // Aplicar migraciones al contenedor de test
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: dbUrl } });

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    // Limpiar tablas en orden (respetar FKs)
    await prisma.reservation.deleteMany();
    await prisma.gift.deleteMany();
    await prisma.list.deleteMany();
    await prisma.circleMember.deleteMany();
    await prisma.circle.deleteMany();
    await prisma.profile.deleteMany();
    await prisma.user.deleteMany();
  });

  it('debe garantizar que dos reservas simultáneas no crean dos registros activos', async () => {
    // Setup: crear user, circle, list, gift
    const user1 = await prisma.user.create({
      data: { email: 'u1@test.com', nombre: 'User 1', passwordHash: 'hash' }
    });
    const user2 = await prisma.user.create({
      data: { email: 'u2@test.com', nombre: 'User 2', passwordHash: 'hash' }
    });
    // ... crear circle, list, gift disponible

    // Ejecutar dos reservas simultáneas
    const [result1, result2] = await Promise.allSettled([
      // reserveGiftUseCase.execute(giftId, user1.id),
      // reserveGiftUseCase.execute(giftId, user2.id),
    ]);

    // Solo una debe haber tenido éxito
    const activeReservations = await prisma.reservation.count({
      where: { giftId: 'gift-id', status: 'ACTIVE' }
    });
    expect(activeReservations).toBe(1);
  });
});
```
