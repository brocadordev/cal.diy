# Fork changes

This fork runs Cal.diy as an API-only backend for a chatbot server. Only that server can access it. This list shows what is different from the upstream project.

## API

- Added an admin API key (`ADMIN_API_KEY` in the `.env` file). With the `x-cal-user-id` header, it acts as any user.
- The admin API key has no rate limit.
- Added the users endpoint (`/v2/users`) for CRUD operations.
- `GET /v2/users?chatbotUserId=<id>` finds the user with this `chatbotUserId` in its metadata. It returns 404 if no user matches and 409 if more than one user matches.
- A new user gets a default schedule. It gets no default event types.
- A new user must have `chatbotUserId` in its metadata.
- A new event type must have `chatbotServiceId` in its metadata. An event type update that sends metadata must also send `chatbotServiceId`.
- The event type outputs return `metadata.chatbotServiceId`.
- A new booking must have `chatbotBookingId` in its metadata.
- A booking without a location keeps no location. It does not fall back to Cal Video.
- Only these routes are available: users, me, bookings, schedules, event types, slots and health. All other routes return 404.
- The API always uses the latest version of each route. The `cal-api-version` header is ignored.

## Bookings

- `POST /v2/bookings` accepts an optional `recurrence: { frequency, count }`. `frequency` is `daily`, `weekly` or `monthly`. The event type does not need a recurrence.
- A request cannot have both `recurrence` and `recurrenceCount`.
- `count` is the number of calendar dates to make, from 2 to 366. A repeat of 1 year stops at 1 year.
- The API calculates the dates in the time zone of the user. A monthly date keeps the day of the month. If a month does not have that day, the API uses the last day of the month.
- For `daily` and `monthly`, the API removes each date that is not fully in the working hours of the user. It never removes the first date.
- A recurrence of the event type (`recurringEvent`) keeps the upstream behavior. The dates use the time zone of the attendee, and the API removes no date.
- The API checks all occurrences before it writes the first occurrence. If an occurrence is not available, the API returns 400 with `error.code` set to `occurrence_unavailable`. It makes no booking.
- If the write of an occurrence fails, the API cancels the occurrences that the request wrote. For a seated event type, it cancels only the seats of the request. If a cancel fails, the API logs it and continues. The response has the error of the write.
- Each occurrence gets the request metadata. The response is an array with one item for each occurrence.
- The recurrence frequency enum of the API has `daily`.
- `POST /v2/bookings/:uid/reschedule` accepts an optional `eventTypeId`. The booking moves to that event type, and the owner of the event type becomes the host.
- A reschedule to another event type gets the event type checks of a new booking: required authentication, managed parent event type and team hosts.
- The reschedule accepts optional `bookingFieldsResponses`. They add responses to the booking, for example for the required booking fields of the new event type. They do not change the existing responses.
- The reschedule accepts an optional `lengthInMinutes` with any value. Without it, the new booking gets the length of the event type.
- A reschedule to another host does not remove the old host's external calendar event. Fix this before calendar sync.

## Bulk routes

These two routes accept only the admin API key. They return 401 for all other authorization.

- `POST /v2/users/bulk-calendars` gets `userIds`, `start` and an optional `end`. Without `end`, the range has no end.
- The response has one calendar for each user, in the request order. A calendar has the time zone, the weekly hours of the default schedule and all the event types of the user, also the hidden ones.
- A calendar also has each accepted or cancelled booking of the user that overlaps the range. `rescheduled` is true for a booking that a reschedule cancelled. `fromReschedule` is the uid of the booking that the booking replaced. `eventTypeId` is null if the event type was deleted.
- A user without a default schedule gets an empty `availability`.
- An unknown or deleted user gives 400 with `error.code` set to `bulk_calendars_invalid`. `error.details.userIds` has the ids.
- `POST /v2/bookings/bulk-reschedule` moves each booking in `items` to an event type and a new start. Each item has `uid`, `eventTypeId`, `start` and an optional `lengthInMinutes`. There is no item limit.
- A move keeps the uid, attendees, metadata and recurring id of the booking. It changes the host to the owner of the event type. It also changes the event type, the start, the end and `userPrimaryEmail`. The end is the start plus `lengthInMinutes`, or plus the event type length.
- One database transaction writes all the moves. If one item fails, no booking changes.
- A move also sets a new idempotency key from the new host and the new times. Thus a new booking can use the old slot of the old host.
- The route accepts a JSON body of up to 5 MB. All other routes keep the 100 kB limit.
- These items give 400 with `error.code` set to `bulk_reschedule_invalid`: an unknown uid, a duplicate uid, an unknown event type, an event type without an owner, a booking that is not accepted or that started, and a start in the past.
- An accepted booking that is already at its target is a no-op. The API does this check after the uid and event type checks, and before the other checks. A cancelled booking at its target gives 400.
- A new time must be fully in the default schedule of the new host, with the date overrides. A host without a default schedule has no free time.
- A new time must not overlap the accepted bookings of the host that are not in the request. Two new times of the same host must not overlap. The time of a no-op blocks the other items. If a new time is not free, the API returns 409 with `error.code` set to `bulk_reschedule_conflict`.
- The free time check ignores buffers, minimum notice, slot steps, out of office, booking limits and seats.
- A move sends no emails, webhooks or reminders. It does not change external calendar events.
- Both errors list each failing uid in `error.details.uids`. A schema error keeps the global 400.
- The checks read the database before the write transaction. A booking that another request makes at the same time can overlap a move. The chatbot server sends all its writes through one queue for each organization, so its own writes do not overlap.

## Defaults

- Emails are disabled by default.
- Sign-up is disabled by default.
- The default locale is `pt-BR` for new users, booking attendees and calendar links.

## Docker

- Docker Compose runs only the API, the database and Redis.
- The web app and Prisma Studio are removed from Docker Compose.
- The API applies the database migrations when it starts.
