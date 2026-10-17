import { IdempotencyKeyService } from "@calcom/platform-libraries/bookings";
import { BookingStatus } from "@calcom/prisma/enums";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { BookingsRepositoryFixture } from "test/fixtures/repository/bookings.repository.fixture";
import { EventTypesRepositoryFixture } from "test/fixtures/repository/event-types.repository.fixture";
import { UserRepositoryFixture } from "test/fixtures/repository/users.repository.fixture";
import { randomString } from "test/utils/randomString";
import { AppModule } from "@/app.module";
import { bootstrap } from "@/bootstrap";
import { getEnv } from "@/env";

const ADMIN_API_KEY = getEnv("ADMIN_API_KEY");
const uniqueName = (name: string) => `bulk-reschedule-${name}-${randomString()}`;

describe("POST /v2/bookings/bulk-reschedule", () => {
  let app: INestApplication;
  let userRepositoryFixture: UserRepositoryFixture;
  let bookingsRepositoryFixture: BookingsRepositoryFixture;
  const hosts: { id: number; email: string }[] = [];
  const eventTypeIds: number[] = [];
  const uids = {
    move: uniqueName("move"),
    noop: uniqueName("noop"),
    blocker: uniqueName("blocker"),
    other: uniqueName("other"),
  };

  const bulkReschedule = (items: object[], key = ADMIN_API_KEY) =>
    request(app.getHttpServer())
      .post("/v2/bookings/bulk-reschedule")
      .set("Authorization", `Bearer ${key}`)
      .send({ items });

  const createBooking = (uid: string, host: number, start: string, end: string) =>
    bookingsRepositoryFixture.create({
      uid,
      title: uid,
      startTime: new Date(start),
      endTime: new Date(end),
      status: BookingStatus.ACCEPTED,
      // The booking flow sets this key in a Prisma extension that the API client does not have.
      idempotencyKey: IdempotencyKeyService.generate({
        startTime: new Date(start),
        endTime: new Date(end),
        userId: hosts[host].id,
      }),
      metadata: { chatbotBookingId: uid },
      user: { connect: { id: hosts[host].id } },
      eventType: { connect: { id: eventTypeIds[host] } },
      attendees: { create: { name: "Guest", email: `${uid}@guest.com`, timeZone: "UTC" } },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    bookingsRepositoryFixture = new BookingsRepositoryFixture(moduleRef);
    const eventTypesRepositoryFixture = new EventTypesRepositoryFixture(moduleRef);
    // main.ts turns off the Nest body parser, so the body middleware of the app parses the JSON.
    app = moduleRef.createNestApplication({ bodyParser: false });
    bootstrap(app as NestExpressApplication);
    await app.init();

    // Each host gets the default schedule, Monday to Friday from 09:00 to 17:00 London time (UTC in January).
    for (const name of ["first-host", "second-host"]) {
      const { body } = await request(app.getHttpServer())
        .post("/v2/users")
        .set("Authorization", `Bearer ${ADMIN_API_KEY}`)
        .send({
          email: `${uniqueName(name)}@api.com`,
          name,
          timeZone: "Europe/London",
          metadata: { chatbotUserId: uniqueName(name) },
        })
        .expect(201);
      hosts.push(body.data);
    }
    for (const [i, length] of [30, 60].entries()) {
      const eventType = await eventTypesRepositoryFixture.create(
        { title: `Event type ${i}`, slug: uniqueName("event-type"), length },
        hosts[i].id
      );
      eventTypeIds.push(eventType.id);
    }

    await createBooking(uids.move, 0, "2030-01-07T10:00:00.000Z", "2030-01-07T10:30:00.000Z");
    await createBooking(uids.noop, 0, "2030-01-07T11:00:00.000Z", "2030-01-07T11:30:00.000Z");
    await createBooking(uids.blocker, 1, "2030-01-07T14:00:00.000Z", "2030-01-07T15:00:00.000Z");
    await createBooking(uids.other, 0, "2030-01-08T10:00:00.000Z", "2030-01-08T10:30:00.000Z");
  });

  afterAll(async () => {
    for (const host of hosts) {
      await userRepositoryFixture.delete(host.id);
    }
    await app.close();
  });

  it("rejects a request without the admin API key", async () => {
    await bulkReschedule(
      [{ uid: uids.move, eventTypeId: eventTypeIds[1], start: "2030-01-07T10:00:00Z" }],
      "wrong-key"
    ).expect(401);
  });

  it("rejects a busy slot with its uid and changes nothing", async () => {
    const { body } = await bulkReschedule([
      { uid: uids.move, eventTypeId: eventTypeIds[1], start: "2030-01-07T10:00:00Z" },
      { uid: uids.other, eventTypeId: eventTypeIds[1], start: "2030-01-07T14:30:00Z" },
    ]).expect(409);

    expect(body.error).toMatchObject({ code: "bulk_reschedule_conflict", details: { uids: [uids.other] } });
    expect(await bookingsRepositoryFixture.getByUid(uids.move)).toMatchObject({
      userId: hosts[0].id,
      startTime: new Date("2030-01-07T10:00:00.000Z"),
    });
  });

  it("rejects invalid items with every failing uid", async () => {
    const unknownUid = uniqueName("unknown");

    const { body } = await bulkReschedule([
      { uid: unknownUid, eventTypeId: eventTypeIds[1], start: "2030-01-07T10:00:00Z" },
      { uid: uids.move, eventTypeId: eventTypeIds[1], start: "2030-01-07T10:00:00Z" },
      { uid: uids.move, eventTypeId: eventTypeIds[1], start: "2030-01-07T12:00:00Z" },
      { uid: uids.other, eventTypeId: eventTypeIds[1], start: "2020-01-07T10:00:00Z" },
    ]).expect(400);

    expect(body.error).toMatchObject({
      code: "bulk_reschedule_invalid",
      details: { uids: [unknownUid, uids.move, uids.other] },
    });
  });

  it("accepts a body over the 100 kB default of the JSON parser", async () => {
    const items = Array.from({ length: 1500 }, (_, i) => ({
      uid: `${uniqueName("unknown")}-${i}`,
      eventTypeId: eventTypeIds[1],
      start: "2030-01-07T10:00:00Z",
    }));
    expect(JSON.stringify({ items }).length).toBeGreaterThan(100 * 1024);

    const { body } = await bulkReschedule(items).expect(400);

    expect(body.error.code).toBe("bulk_reschedule_invalid");
    expect(body.error.details.uids).toHaveLength(1500);
  });

  it("moves the bookings in place and skips a no-op", async () => {
    const noopBefore = await bookingsRepositoryFixture.getByUid(uids.noop);

    const { body } = await bulkReschedule([
      { uid: uids.move, eventTypeId: eventTypeIds[1], start: "2030-01-07T10:00:00Z" },
      { uid: uids.noop, eventTypeId: eventTypeIds[0], start: "2030-01-07T11:00:00Z" },
    ]).expect(200);

    expect(body).toEqual({
      status: "success",
      data: [
        { uid: uids.move, start: "2030-01-07T10:00:00.000Z", end: "2030-01-07T11:00:00.000Z" },
        { uid: uids.noop, start: "2030-01-07T11:00:00.000Z", end: "2030-01-07T11:30:00.000Z" },
      ],
    });
    expect(await bookingsRepositoryFixture.getByUidWithAttendees(uids.move)).toMatchObject({
      userId: hosts[1].id,
      eventTypeId: eventTypeIds[1],
      startTime: new Date("2030-01-07T10:00:00.000Z"),
      endTime: new Date("2030-01-07T11:00:00.000Z"),
      userPrimaryEmail: hosts[1].email,
      status: BookingStatus.ACCEPTED,
      metadata: { chatbotBookingId: uids.move },
      attendees: [expect.objectContaining({ email: `${uids.move}@guest.com` })],
    });
    expect((await bookingsRepositoryFixture.getByUid(uids.noop))?.updatedAt).toEqual(noopBefore?.updatedAt);
  });

  it("gives a moved booking the key of its new host and times, so the old slot can be booked again", async () => {
    expect((await bookingsRepositoryFixture.getByUid(uids.move))?.idempotencyKey).toBe(
      IdempotencyKeyService.generate({
        startTime: new Date("2030-01-07T10:00:00.000Z"),
        endTime: new Date("2030-01-07T11:00:00.000Z"),
        userId: hosts[1].id,
      })
    );

    await expect(
      createBooking(uniqueName("old-slot"), 0, "2030-01-07T10:00:00.000Z", "2030-01-07T10:30:00.000Z")
    ).resolves.toMatchObject({ userId: hosts[0].id });
  });
});
