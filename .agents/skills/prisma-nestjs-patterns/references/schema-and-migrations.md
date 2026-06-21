# Prisma — Schema Design y Migraciones

## Fuentes oficiales

- Schema reference: https://www.prisma.io/docs/orm/reference/prisma-schema-reference
- Prisma Migrate: https://www.prisma.io/docs/orm/prisma-migrate
- Índices: https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes

---

## 1. Schema completo del proyecto HADA

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  nombre       String
  passwordHash String
  fcmTokens    String[] @default([])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relaciones
  ownedCircles  Circle[]         @relation("CircleOwner")
  memberships   CircleMember[]
  profiles      Profile[]
  reservations  Reservation[]

  @@map("users")
}

model Circle {
  id               String    @id @default(uuid())
  nombre           String
  ownerId          String
  inviteCode       String    @unique
  inviteExpiresAt  DateTime?
  createdAt        DateTime  @default(now())

  // Relaciones
  owner    User           @relation("CircleOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members  CircleMember[]
  lists    List[]

  @@index([ownerId])
  @@map("circles")
}

model CircleMember {
  id       String     @id @default(uuid())
  circleId String
  userId   String
  role     MemberRole @default(MEMBER)
  joinedAt DateTime   @default(now())

  circle Circle @relation(fields: [circleId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([circleId, userId])   // Un usuario no puede ser miembro dos veces del mismo círculo
  @@index([userId, circleId])    // Validación de pertenencia (operación más frecuente)
  @@map("circle_members")
}

model Profile {
  id           String   @id @default(uuid())
  ownerId      String
  nombre       String
  birthdayDate DateTime?
  isPrincipal  Boolean  @default(false)
  reminderScheduledAt DateTime?
  createdAt    DateTime @default(now())

  owner User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  lists List[]

  @@index([ownerId])
  @@index([birthdayDate])        // Cálculo de próximos cumpleaños
  @@map("profiles")
}

model List {
  id             String   @id @default(uuid())
  ownerProfileId String
  circleId       String
  titulo         String
  createdAt      DateTime @default(now())

  ownerProfile Profile @relation(fields: [ownerProfileId], references: [id], onDelete: Cascade)
  circle       Circle  @relation(fields: [circleId], references: [id], onDelete: Cascade)
  gifts        Gift[]

  @@index([circleId])            // Listar listas de un círculo
  @@index([ownerProfileId])
  @@map("lists")
}

model Gift {
  id             String      @id @default(uuid())
  listId         String
  titulo         String
  descripcion    String?
  url            String?
  imagenUrl      String?
  precioEstimado Decimal?    @db.Decimal(10, 2)
  estado         GiftStatus  @default(AVAILABLE)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  list        List         @relation(fields: [listId], references: [id], onDelete: Cascade)
  reservation Reservation?

  @@index([listId])
  @@index([listId, estado])      // Filtrar disponibles/reservados en una lista
  @@map("gifts")
}

model Reservation {
  id           String            @id @default(uuid())
  giftId       String            @unique  // Un regalo, una reserva
  reservedById String
  reservedAt   DateTime          @default(now())
  status       ReservationStatus @default(ACTIVE)

  gift       Gift @relation(fields: [giftId], references: [id], onDelete: Cascade)
  reservedBy User @relation(fields: [reservedById], references: [id])

  @@index([reservedById])        // Ver mis reservas activas
  @@index([giftId, status])      // Verificar reserva activa en un regalo
  @@map("reservations")
}

// Enums
enum MemberRole {
  OWNER
  MEMBER
}

enum GiftStatus {
  AVAILABLE
  RESERVED
  RECEIVED
}

enum ReservationStatus {
  ACTIVE
  CANCELLED
}
```

---

## 2. Workflow de migraciones

```bash
# Desarrollo: crear migración a partir del schema
npx prisma migrate dev --name add_fcm_tokens_to_user

# Producción: aplicar migraciones existentes (NO genera nuevas)
npx prisma migrate deploy

# Ver estado de migraciones
npx prisma migrate status

# Reset completo (solo desarrollo)
npx prisma migrate reset
```

### Regla de migraciones en CI/CD

```yaml
# En el pipeline de GitHub Actions, ANTES del deploy a Cloud Run:
- name: Apply database migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

---

## 3. Índices — criterios de diseño

Índice obligatorio en cualquier campo que aparezca en:

- Cláusula `WHERE` de queries frecuentes
- Campos de `JOIN` / relaciones FK
- Campos de `ORDER BY` en paginación
- Campos de unicidad (`@unique` crea índice automáticamente)

```prisma
// Índice compuesto cuando se filtra siempre por dos campos juntos
@@index([circleId, userId])

// Índice único para garantizar invariante de negocio
@@unique([circleId, userId])  // Un miembro no puede repetirse en un círculo
```

---

## 4. Seeds para desarrollo

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('password123');

  const user = await prisma.user.upsert({
    where: { email: 'test@hada.app' },
    update: {},
    create: {
      email: 'test@hada.app',
      nombre: 'Usuario Test',
      passwordHash,
      profiles: {
        create: {
          nombre: 'Usuario Test',
          isPrincipal: true,
          birthdayDate: new Date('1990-05-15'),
        },
      },
    },
  });

  console.log('Seed completado:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

```json
// package.json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

```bash
npx prisma db seed
```
