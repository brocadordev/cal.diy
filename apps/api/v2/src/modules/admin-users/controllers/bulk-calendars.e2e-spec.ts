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
const uniqueName = (name: string) => `bulk-calendars-${name}-${randomString()}`;

describe("POST /v2/users/bulk-calendars", () => {
  let app: INestApplication;
  let userRepositoryFixture: UserRepositoryFixture;
  let userId: number;
  let userWithoutScheduleId: number;
  let eventTypeId: number;
  const eventTypeSlug = uniqueName("hidden");
  const uids = {
    accepted: uniqueName("accepted"),
    rescheduled: uniqueName("rescheduled"),
    fromReschedule: uniqueName("from-reschedule"),
    pending: uniqueName("pending"),
    outside: uniqueName("outside"),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    userRepositoryFixture = new UserRepositoryFixture(moduleRef);
    const eventTypesRepositoryFixture = new EventTypesRepositoryFixture(moduleRef);
    const bookingsRepositoryFixture = new BookingsRepositoryFixture(moduleRef);
    app = moduleRef.createNestApplication();
    bootstrap(app as NestExpressApplication);
    await app.init();

    // The admin route creates the default schedule, Monday to Friday from 09:00 to 17:00.
    const { body } = await request(app.getHttpServer())
      .post("/v2/users")
      .set("Authorization", `Bearer ${ADMIN_API_KEY}`)
      .send({
        email: `${uniqueName("user")}@api.com`,
        name: "With schedule",
        timeZone: "America/Sao_Paulo",
        metadata: { chatbotUserId: uniqueName("chatbot") },
      })
      .expect(201);
    userId = body.data.id;
    userWithoutScheduleId = (await userRepositoryFixture.create({ email: `${uniqueName("user")}@api.com` }))
      .id;
    eventTypeId = (
      await eventTypesRepositoryFixture.create(
        { title: "Hidden", slug: eventTypeSlug, length: 45, hidden: true },
        userId
      )
    ).id;

    const createBooking = (uid: string, start: string, status: BookingStatus, data = {}) =>
      bookingsRepositoryFixture.create({
        uid,
        title: uid,
        startTime: new Date(start),
        endTime: new Date(new Date(start).getTime() + 45 * 60_000),
        status,
        user: { connect: { id: userId } },
        eventType: { connect: { id: eventTypeId } },
        ...data,
      });
    await createBooking(uids.accepted, "2030-01-07T13:00:00.000Z", BookingStatus.ACCEPTED);
    await createBooking(uids.rescheduled, "2030-01-07T15:00:00.000Z", BookingStatus.CANCELLED, {
      rescheduled: true,
    });
    await createBooking(uids.fromReschedule, "2030-01-08T13:00:00.000Z", BookingStatus.ACCEPTED, {
      fromReschedule: uids.rescheduled,
    });
    await createBooking(uids.pending, "2030-01-08T15:00:00.000Z", BookingStatus.PENDING);
    await createBooking(uids.outside, "2030-01-21T13:00:00.000Z", BookingStatus.ACCEPTED);
  });

  afterAll(async () => {
    await userRepositoryFixture.delete(userId);
    await userRepositoryFixture.delete(userWithoutScheduleId);
    await app.close();
  });

  it("rejects a request without the admin API key", async () => {
    await request(app.getHttpServer())
      .post("/v2/users/bulk-calendars")
      .set("Authorization", "Bearer wrong-key")
      .send({ userIds: [userId], start: "2030-01-07T00:00:00Z" })
      .expect(401);
  });

  it("returns the calendar of each user in the request order", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/v2/users/bulk-calendars")
      .set("Authorization", `Bearer ${ADMIN_API_KEY}`)
      .send({
        userIds: [userWithoutScheduleId, userId],
        start: "2030-01-07T00:00:00Z",
        end: "2030-01-10T00:00:00Z",
      })
      .expect(200);

    const booking = (uid: string, start: string, end: string, status: string, rescheduled = false) => ({
      uid,
      eventTypeId,
      start,
      end,
      status,
      rescheduled,
      fromReschedule: uid === uids.fromReschedule ? uids.rescheduled : null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(body).toEqual({
      status: "success",
      data: [
        {
          userId: userWithoutScheduleId,
          timeZone: "Europe/London",
          availability: [],
          eventTypes: [],
          bookings: [],
        },
        {
          userId,
          timeZone: "America/Sao_Paulo",
          availability: [
            {
              days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              startTime: "09:00",
              endTime: "17:00",
            },
          ],
          eventTypes: [{ id: eventTypeId, slug: eventTypeSlug, lengthInMinutes: 45 }],
          bookings: [
            booking(uids.accepted, "2030-01-07T13:00:00.000Z", "2030-01-07T13:45:00.000Z", "accepted"),
            booking(
              uids.rescheduled,
              "2030-01-07T15:00:00.000Z",
              "2030-01-07T15:45:00.000Z",
              "cancelled",
              true
            ),
            booking(uids.fromReschedule, "2030-01-08T13:00:00.000Z", "2030-01-08T13:45:00.000Z", "accepted"),
          ],
        },
      ],
    });
  });

  it("returns the bookings from start on without an end", async () => {
    const { body } = await request(app.getHttpServer())
      .post("/v2/users/bulk-calendars")
      .set("Authorization", `Bearer ${ADMIN_API_KEY}`)
      .send({ userIds: [userId], start: "2030-01-07T13:30:00Z" })
      .expect(200);

    expect(body.data[0].bookings.map(({ uid }: { uid: string }) => uid)).toEqual([
      uids.accepted,
      uids.rescheduled,
      uids.fromReschedule,
      uids.outside,
    ]);
  });

  it("rejects unknown and deleted users with their ids", async () => {
    const deletedUser = await userRepositoryFixture.create({ email: `${uniqueName("deleted")}@api.com` });
    await userRepositoryFixture.delete(deletedUser.id);

    const { body } = await request(app.getHttpServer())
      .post("/v2/users/bulk-calendars")
      .set("Authorization", `Bearer ${ADMIN_API_KEY}`)
      .send({ userIds: [userId, deletedUser.id, 2_000_000_000], start: "2030-01-07T00:00:00Z" })
      .expect(400);

    expect(body.status).toBe("error");
    expect(body.error).toMatchObject({
      code: "bulk_calendars_invalid",
      details: { userIds: [deletedUser.id, 2_000_000_000] },
    });
  });
});
