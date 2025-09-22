---
title: "OLE Automation Date"
publishedOn: 2025-08-07
---

TIL about the `[Excel serial date number](https://support.microsoft.com/en-us/office/date-systems-in-excel-e7fe7167-48a9-4b96-bb53-5612a800b487)` format.

They’re also known as an `OLE Automation date` - which, I assume, is how mechanical bulls track their calendars.

The date is present in the format `45911.32361` where

1. The integer part `45911` represents the number of days since the epoch date.
2. The decimal part `.32361` represents the fraction of a day, ie the time of day

I had a zap populate a google sheet with “current time”. The formatting helper in Zapier shows the current time in a specific format but either

1. google sheets automatically converted it to the excel format (for some reason?!) when it saw the date from Zapier OR
2. The web hook from squarespace is hooking into a db/csv/something that is optimised for excel, as opposed to coming from the form directly (which makes sense).
