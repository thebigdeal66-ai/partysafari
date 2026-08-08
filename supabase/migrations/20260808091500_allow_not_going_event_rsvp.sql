alter table public.event_rsvps
  drop constraint if exists event_rsvps_status_check;

alter table public.event_rsvps
  add constraint event_rsvps_status_check
  check (status in ('going', 'interested', 'not_going'));
