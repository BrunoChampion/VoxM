# Prisma — Query Patterns y Optimización

## Fuentes oficiales

- Select fields: https://www.prisma.io/docs/orm/prisma-client/queries/select-fields
- Relation queries: https://www.prisma.io/docs/orm/prisma-client/queries/relation-queries
- Pagination: https://www.prisma.io/docs/orm/prisma-client/queries/pagination
- Filtering: https://www.prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting

---

## 1. Select vs Include — cuándo usar cada uno

```typescript
// include: trae todos los campos de la relación
const listWithGifts = await prisma.list.findUnique({
  where: { id },
  include: {
    gifts: true,           // Todos los campos de Gift
    ownerProfile: true,    // Todos los campos de Profile
  },
});

// select: control granular — solo los campos necesarios (más eficiente)
const listWithGifts = await prisma.list.findUnique({
  where: { id },
  select: {
    id: true,
    titulo: true,
    createdAt: true,
    ownerProfile: {
      select: { id: true, nombre: true }  // Solo nombre del perfil
    },
    gifts: {
      select: {
        id: true,
        titulo: true,
        imagenUrl: true,
        precioEstimado: true,
        estado: true,
        // ⚠️ Para el propietario: NO incluir reservation.reservedById
        reservation: {
          select: { reservedAt: true, status: true }  // SIN reservedById
        }
      },
      orderBy: { createdAt: 'asc' }
    }
  }
});
```

---

## 2. Prevención de N+1 — el error más común

```typescript
// ❌ N+1: 1 query para listas + N queries para regalos de cada lista
const lists = await prisma.list.findMany({ where: { circleId } });
for (const list of lists) {
  list.gifts = await prisma.gift.findMany({ where: { listId: list.id } }); // N queries!
}

// ✅ 1 query con include
const lists = await prisma.list.findMany({
  where: { circleId },
  include: { gifts: true },  // JOIN en una sola query
});
```

---

## 3. Query de listas de un círculo (operación más frecuente de HADA)

```typescript
async getCircleLists(circleId: string, viewerUserId: string) {
  const lists = await this.prisma.list.findMany({
    where: { circleId },
    select: {
      id: true,
      titulo: true,
      createdAt: true,
      ownerProfile: {
        select: { id: true, nombre: true, birthdayDate: true, isPrincipal: true }
      },
      gifts: {
        select: {
          id: true,
          titulo: true,
          descripcion: true,
          url: true,
          imagenUrl: true,
          precioEstimado: true,
          estado: true,
          createdAt: true,
          reservation: {
            where: { status: 'ACTIVE' },
            select: {
              reservedAt: true,
              // Solo revelar si el viewer ES el reservante
              reservedById: true,  // Se filtra en el mapper, no en la query
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Mapper: ocultar reservedById si el viewer no es el reservante
  return lists.map(list => ({
    ...list,
    gifts: list.gifts.map(gift => ({
      ...gift,
      reservation: gift.reservation ? {
        reservedAt: gift.reservation.reservedAt,
        // Solo el reservante ve que puede liberar; el dueño no ve quién reservó
        estuReserva: gift.reservation.reservedById === viewerUserId,
      } : null
    }))
  }));
}
```

---

## 4. Paginación con cursor (recomendado para listas largas)

```typescript
// Cursor-based pagination (más eficiente que offset para grandes volúmenes)
async getPaginatedGifts(listId: string, cursor?: string, take = 20) {
  const gifts = await this.prisma.gift.findMany({
    where: { listId },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'asc' }
  });

  return {
    items: gifts,
    nextCursor: gifts.length === take ? gifts[gifts.length - 1].id : null,
  };
}
```

---

## 5. Validar pertenencia al círculo (query crítica para seguridad)

```typescript
// Usada en guards y use cases — debe ser muy eficiente
async isMemberOfCircle(userId: string, circleId: string): Promise<boolean> {
  const member = await this.prisma.circleMember.findUnique({
    where: {
      // @@unique([circleId, userId]) en el schema habilita esta sintaxis
      circleId_userId: { circleId, userId }
    },
    select: { id: true }  // Solo necesitamos saber si existe
  });
  return member !== null;
}
```

---

## 6. Próximos cumpleaños (query para recordatorios)

```typescript
async getUpcomingBirthdays(userId: string, daysAhead = 30) {
  const today = new Date();
  const future = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  // Obtener perfiles de los círculos del usuario
  return this.prisma.profile.findMany({
    where: {
      ownerProfile: {
        memberships: {
          some: { userId }
        }
      },
      birthdayDate: { not: null },
    },
    select: {
      id: true,
      nombre: true,
      birthdayDate: true,
      lists: {
        where: { circle: { members: { some: { userId } } } },
        select: { id: true, titulo: true }
      }
    },
    orderBy: { birthdayDate: 'asc' }
  });
}
```

---

## 7. Upsert — crear o actualizar en una operación

```typescript
// Registrar/actualizar token FCM de dispositivo
async upsertFcmToken(userId: string, token: string): Promise<void> {
  await this.prisma.user.update({
    where: { id: userId },
    data: {
      // Añadir token al array si no existe (PostgreSQL array operations)
      fcmTokens: { push: token }
    }
  });
}
```
