/******************************************************************************
 * - This script monitors updates in the owner's calendar, declines any events
 *   coming from company domains and overlapping to other events
 ******************************************************************************/

MY_CALENDAR_ID = "your_calendar_id";
MY_EMAIL = "your_email_address";
ACTIVE_DOMAINS = [
  "dominio1.com",
  "dominio2.com",
  "dominio3.com",
];
DAYS_TO_LOOK_AHEAD = 30;

function onCalendarChange() {
  var options = {
    showDeleted: false,
    singleEvents: true,
    orderBy: "startTime",
  };

  options.timeMin = getRelativeDate(0, 0).toISOString();
  options.timeMax = getRelativeDate(DAYS_TO_LOOK_AHEAD, 0).toISOString();

  var events;
  var pageToken;

  do {
    try {
      options.pageToken = pageToken;
      events = Calendar.Events.list(MY_CALENDAR_ID, options);
    } catch (e) {
      if (
        e.message === "Sync token is no longer valid, a full sync is required."
      ) {
        onCalendarChange();
        return;
      } else {
        throw new Error(e.message);
      }
    }

    processEventsList(events);

    pageToken = events.nextPageToken;
  } while (pageToken);
}

function processEventsList(events) {
  if (!events.items || events.items.length < 1) console.log("No events found");

  for (var i = 0; i < events.items.length; i++) {
    var event = events.items[i];
    if (
      event.attendees != undefined &&
      event.status != "cancelled" &&
      isInternalCreator(event.creator.email) &&
      findMyResponseStatusTo(event) === "needsAction"
    ) {
      console.log(
        "Analizing time for %s - %s to %s",
        event.summary,
        event.start.dateTime,
        event.end.dateTime
      );
      if (isAnOverlappingEvent(event)) {
        if (isInternalCreator(event.creator.email)) {
          declineAndNotify(event);
        } else {
          console.log("%s is not in company", event.creator.email);
        }
      }
      console.log("---------------");
    }
  }
}

function isInternalCreator(email) {
  var domainRegexMatch = new RegExp("@(.+)");
  var e = domainRegexMatch.exec(email)[1];
  if (email === MY_CALENDAR_ID) return false;
  return ACTIVE_DOMAINS.indexOf(e) != -1;
}

function sendAlertEmail(to, emailSubject) {
  MailApp.sendEmail({
    to: to,
    subject: emailSubject,
    htmlBody: emailTemplate,
  });
}

function findMeIn(event) {
  var result;
  if (event.attendees) {
    for (j = 0; j < event.attendees.length; j++) {
      if (event.attendees[j].self) {
        result = event.attendees[j];
        break;
      }
    }
  }
  return result;
}

function findMyResponseStatusTo(event) {
  const me = findMeIn(event);
  return me ? me.responseStatus : "not found";
}

function isAnOverlappingEvent(event) {
  overlappingEvents = Calendar.Events.list(MY_CALENDAR_ID, {
    timeMin: event.start.dateTime,
    timeMax: event.end.dateTime,
    showDeleted: false,
    singleEvents: true,
    orderBy: "startTime",
  });

  for (var j = 0; j < overlappingEvents.items.length; j++) {
    const me = findMeIn(overlappingEvents.items[j]);
    if (overlappingEvents.items[j].id === event.id) continue;
    console.log(
      "FOUND %s - %s to %s",
      overlappingEvents.items[j].summary,
      overlappingEvents.items[j].start.dateTime,
      overlappingEvents.items[j].end.dateTime
    );
    return true;
  }
  return false;
}

function declineAndNotify(event) {
  if (event.attendees) {
    for (j = 0; j < event.attendees.length; j++) {
      var attendee = event.attendees[j];
      if (attendee.self && attendee.responseStatus === "needsAction") {
        attendee.responseStatus = "declined";
        event.attendees[j] = attendee;
      }
    }
    try {
      event = Calendar.Events.update(
        event,
        "primary",
        event.id,
        {},
        { "If-Match": event.etag }
      );
      sendAlertEmail(event.creator.email, "RIFIUTATO: " + event.summary);
      sendAlertEmail(MY_EMAIL, "RIFIUTATO: " + event.summary);
      console.log(
        "Successfully declined event: [%s, %s]",
        event.id,
        event.summary
      );
    } catch (e) {
      console.log("Failed to decline event with exception: " + e);
    }
  }
}

function getRelativeDate(daysOffset, hour) {
  var date = new Date();
  date.setDate(date.getDate() + daysOffset);
  date.setHours(hour);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}
