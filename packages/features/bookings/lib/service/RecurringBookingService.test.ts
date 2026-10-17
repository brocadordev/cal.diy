import {
  createBookingScenario,
  getBooker,
  getDate,
  getGoogleCalendarCredential,
  getOrganizer,
  getScenarioData,
  mockCalendarToHaveNoBusySlots,
  mockSuccessfulVideoMeetingCreation,
  TestData,
} from "@calcom/testing/lib/bookingScenario/bookingScenario";
import {
  expectBookingCreatedWebhookToHaveBeenFired,
  expectBookingToBeInDatabase,
  expectSuccessfulBookingCreationEmails,
  expectSuccessfulCalendarEventCreationInCalendar,
} from "@calcom/testing/lib/bookingScenario/expects";
import { getMockRequestDataForBooking } from "@calcom/testing/lib/bookingScenario/getMockRequestDataForBooking";
import { setupAndTeardown } from "@calcom/testing/lib/bookingScenario/setupAndTeardown";

import { v4 as uuidv4 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { getRecurringBookingService } from "@calcom/features/bookings/di/RecurringBookingService.container";
import type { CreateRecurringBookingData } from "@calcom/features/bookings/lib/dto/types";
import prismaMock from "@calcom/testing/lib/__mocks__/prisma";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { BookingStatus } from "@calcom/prisma/enums";
import { test } from "@calcom/testing/lib/fixtures/fixtures";

import handleCancelBooking from "../handleCancelBooking";
import { RecurringBookingService } from "./RecurringBookingService";
import type { RegularBookingService } from "./RegularBookingService";

vi.mock("../handleCancelBooking", () => ({ default: vi.fn(async () => ({})) }));

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function getPlusDayDate(date: string, days: number) {
  return new Date(new Date(date).getTime() + days * DAY_IN_MS);
}

// Local test runs sometime gets too slow
const timeout = process.env.CI ? 5000 : 20000;
describe("handleNewRecurringBooking", () => {
  setupAndTeardown();

  describe("Recurring EventType:", () => {
    describe("User event type:", () => {
      test(
        `should create successful bookings for the number of slots requested
          1. Should create the same number of bookings as requested slots in the database
          2. Should send emails for the first booking only to the booker as well as organizer
          3. Should create a calendar event for every booking in the destination calendar
          3. Should trigger BOOKING_CREATED webhook for every booking
      `,
        async ({ emails }) => {
          const booker = getBooker({
            email: "booker@example.com",
            name: "Booker",
          });

          const organizer = getOrganizer({
            name: "Organizer",
            email: "organizer@example.com",
            id: 101,
            schedules: [TestData.schedules.IstWorkHours],
            credentials: [getGoogleCalendarCredential()],
            selectedCalendars: [TestData.selectedCalendars.google],
            destinationCalendar: {
              integration: "google_calendar",
              externalId: "organizer@google-calendar.com",
            },
          });

          const recurrence = getRecurrence({
            type: "weekly",
            numberOfOccurrences: 3,
          });
          const plus1DateString = getDate({ dateIncrement: 1 }).dateString;
          await createBookingScenario(
            getScenarioData({
              webhooks: [
                {
                  userId: organizer.id,
                  eventTriggers: ["BOOKING_CREATED"],
                  subscriberUrl: "http://my-webhook.example.com",
                  active: true,
                  eventTypeId: 1,
                  appId: null,
                },
              ],
              eventTypes: [
                {
                  id: 1,
                  slotInterval: 30,
                  length: 30,
                  recurringEvent: recurrence,
                  users: [
                    {
                      id: 101,
                    },
                  ],
                  destinationCalendar: {
                    integration: "google_calendar",
                    externalId: "event-type-1@google-calendar.com",
                  },
                },
              ],

              organizer,
              apps: [TestData.apps["google-calendar"], TestData.apps["daily-video"]],
            })
          );

          mockSuccessfulVideoMeetingCreation({
            metadataLookupKey: "dailyvideo",
            videoMeetingData: {
              id: "MOCK_ID",
              password: "MOCK_PASS",
              url: `http://mock-dailyvideo.example.com/meeting-1`,
            },
          });

          const calendarMock = await mockCalendarToHaveNoBusySlots("googlecalendar", {
            create: {
              id: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
              iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
            },
          });

          const recurringCountInRequest = 2;
          const mockBookingData = getMockRequestDataForBooking({
            data: {
              eventTypeId: 1,
              start: `${plus1DateString}T04:00:00.000Z`,
              end: `${plus1DateString}T04:30:00.000Z`,
              recurringEventId: uuidv4(),
              recurringCount: recurringCountInRequest,
              responses: {
                email: booker.email,
                name: booker.name,
                location: { optionValue: "", value: "integrations:daily" },
              },
            },
          });

          const numOfSlotsToBeBooked = 4;

          // Create an array of booking data for multiple slots
          const bookingDataArray = Array(numOfSlotsToBeBooked)
            .fill(mockBookingData)
            .map((mockBookingData, index) => {
              return {
                ...mockBookingData,
                start: getPlusDayDate(mockBookingData.start, index).toISOString(),
                end: getPlusDayDate(mockBookingData.end, index).toISOString(),
              };
            });

          const recurringBookingService = getRecurringBookingService();
          // Call handleNewRecurringBooking directly instead of through API
          const createdBookings = await recurringBookingService.createBooking({
            bookingData: bookingDataArray,
            bookingMeta: {
              userId: -1, // Simulating anonymous user like in the API test
            },
            creationSource: "WEBAPP",
          });

          expect(createdBookings.length).toBe(numOfSlotsToBeBooked);
          for (const [index, createdBooking] of Object.entries(createdBookings)) {
            logger.debug("Assertion for Booking with index:", index, { createdBooking });
            expect(createdBooking.responses).toEqual(
              expect.objectContaining({
                email: booker.email,
                name: booker.name,
              })
            );

            expect(createdBooking).toEqual(
              expect.objectContaining({
                location: "integrations:daily",
              })
            );

            await expectBookingToBeInDatabase({
              description: "",

              uid: createdBooking.uid!,
              eventTypeId: mockBookingData.eventTypeId,
              status: BookingStatus.ACCEPTED,
              recurringEventId: mockBookingData.recurringEventId,
              references: [
                {
                  type: "daily_video",
                  uid: "MOCK_ID",
                  meetingId: "MOCK_ID",
                  meetingPassword: "MOCK_PASS",
                  meetingUrl: "http://mock-dailyvideo.example.com/meeting-1",
                },
                {
                  type: "google_calendar",
                  uid: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
                  meetingId: "MOCKED_GOOGLE_CALENDAR_EVENT_ID",
                  meetingPassword: "MOCK_PASSWORD",
                },
              ],
            });

            expectBookingCreatedWebhookToHaveBeenFired({
              booker,
              organizer,
              location: "integrations:daily",
              subscriberUrl: "http://my-webhook.example.com",
              videoCallUrl: `${WEBAPP_URL}/video/${createdBookings[0].uid}`,
            });
          }

          expectSuccessfulBookingCreationEmails({
            booker,
            booking: {
              uid: createdBookings[0].uid!,
              urlOrigin: WEBAPP_URL,
            },
            organizer,
            emails,
            bookingTimeRange: {
              start: createdBookings[0].startTime!,

              end: createdBookings[0].endTime!,
            },
            iCalUID: "MOCKED_GOOGLE_CALENDAR_ICS_ID",
            recurrence: {
              ...recurrence,
              count: recurringCountInRequest,
            },
          });

          expect(emails.get().length).toBe(2);

          expectSuccessfulCalendarEventCreationInCalendar(calendarMock, [
            {
              calendarId: "event-type-1@google-calendar.com",
              videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
            },
            {
              calendarId: "event-type-1@google-calendar.com",
              videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
            },
            {
              calendarId: "event-type-1@google-calendar.com",
              videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
            },
            {
              calendarId: "event-type-1@google-calendar.com",
              videoCallUrl: "http://mock-dailyvideo.example.com/meeting-1",
            },
          ]);
        },
        timeout
      );
    });

    it.each([0, 1])(
      "should create no booking when the occurrence %i is not available",
      async (busyIndex) => {
        const organizer = getOrganizer({
          name: "Organizer",
          email: "organizer@example.com",
          id: 101,
          schedules: [TestData.schedules.IstWorkHours],
        });
        const plus1DateString = getDate({ dateIncrement: 1 }).dateString;
        const firstStart = `${plus1DateString}T05:00:00.000Z`;
        const firstEnd = `${plus1DateString}T05:30:00.000Z`;
        await createBookingScenario(
          getScenarioData({
            eventTypes: [
              {
                id: 1,
                slotInterval: 30,
                length: 30,
                recurringEvent: getRecurrence({ type: "weekly", numberOfOccurrences: 3 }),
                users: [{ id: 101 }],
              },
            ],
            bookings: [
              {
                eventTypeId: 1,
                userId: 101,
                status: BookingStatus.ACCEPTED,
                startTime: getPlusDayDate(firstStart, busyIndex).toISOString(),
                endTime: getPlusDayDate(firstEnd, busyIndex).toISOString(),
              },
            ],
            organizer,
          })
        );

        const recurringEventId = uuidv4();
        const mockBookingData = getMockRequestDataForBooking({
          data: {
            eventTypeId: 1,
            start: firstStart,
            end: firstEnd,
            recurringEventId,
            recurringCount: 3,
            responses: {
              email: "booker@example.com",
              name: "Booker",
              location: { optionValue: "", value: "New York" },
            },
          },
        });
        const bookingData = [0, 1, 2].map((index) => ({
          ...mockBookingData,
          start: getPlusDayDate(firstStart, index).toISOString(),
          end: getPlusDayDate(firstEnd, index).toISOString(),
        }));

        await expect(
          getRecurringBookingService().createBooking({
            bookingData,
            bookingMeta: { userId: -1 },
            creationSource: "WEBAPP",
          })
        ).rejects.toThrowError(ErrorCode.OccurrenceUnavailable);
        expect(await prismaMock.booking.count({ where: { recurringEventId } })).toBe(0);
      },
      timeout
    );
  });

  describe("Rollback:", () => {
    it("should cancel the written occurrences and rethrow the write error when a write fails", async () => {
      const writeError = new Error("write failed");
      const createBooking = vi
        .fn()
        .mockResolvedValueOnce({ uid: "first" })
        .mockResolvedValueOnce({ uid: "second", seatReferenceUid: "seat-of-second" })
        .mockRejectedValueOnce(writeError);
      vi.mocked(handleCancelBooking).mockRejectedValueOnce(new Error("cancel failed"));
      const service = new RecurringBookingService({
        regularBookingService: { createBooking } as unknown as RegularBookingService,
      });
      const occurrence = { start: "2027-01-01T10:00:00.000Z", end: "2027-01-01T10:30:00.000Z" };

      await expect(
        service.createBooking({
          bookingData: [occurrence, occurrence, occurrence] as unknown as CreateRecurringBookingData,
          bookingMeta: { userId: 7 },
          creationSource: "API_V2",
        })
      ).rejects.toBe(writeError);
      // The first cancel fails, and the second occurrence is still cancelled.
      expect(vi.mocked(handleCancelBooking).mock.calls.map(([input]) => input)).toEqual([
        {
          bookingData: {
            uid: "first",
            seatReferenceUid: undefined,
            cancellationReason: "The recurring booking could not be created",
          },
          userId: 7,
          actionSource: "API_V2",
        },
        {
          bookingData: {
            uid: "second",
            seatReferenceUid: "seat-of-second",
            cancellationReason: "The recurring booking could not be created",
          },
          userId: 7,
          actionSource: "API_V2",
        },
      ]);
    });
  });

  function getRecurrence({
    type,
    numberOfOccurrences,
  }: {
    type: "weekly" | "monthly" | "yearly";
    numberOfOccurrences: number;
  }) {
    const freq = type === "yearly" ? 0 : type === "monthly" ? 1 : 2;
    return { freq, count: numberOfOccurrences, interval: 1 };
  }
});
