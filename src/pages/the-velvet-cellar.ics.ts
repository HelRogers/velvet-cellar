/**
 * The calendar file behind "Add to calendar" (Apple Calendar, Outlook and others).
 * Built from src/content/site.json. It sits behind the access gate like everything else.
 * No end time has been supplied, so the entry marks the start only.
 */
import type { APIRoute } from 'astro';
import site from '../content/site.json';

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export const GET: APIRoute = () => {
  const { event } = site;
  const start = event.startsAtUtc.replace(/[-:]/g, '').replace('.000', '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Velvet Cellar//Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:the-velvet-cellar-18-december-2026@velvet-cellar',
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    ...(event.endsAt ? [`DTEND:${String(event.endsAt).replace(/[-:]/g, '')}`] : []),
    `SUMMARY:${escape(`${event.venue}: ${event.occasion}`)}`,
    `LOCATION:${escape(event.address)}`,
    `DESCRIPTION:${escape(`${event.attire}. Kindly respond by ${event.rsvpBy}.`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: { 'content-type': 'text/calendar; charset=utf-8' },
  });
};
