alter table public.activity_feed drop constraint if exists activity_feed_action_type_check;
alter table public.activity_feed add constraint activity_feed_action_type_check check (action_type = any (array['created_event'::text,'event_created'::text,'rsvp_event'::text,'rsvp'::text,'commented_event'::text,'saved_event'::text,'followed_profile'::text]));;
