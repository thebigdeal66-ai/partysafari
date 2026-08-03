alter table public.calibration_feedback
	alter column venue_id type uuid
	using (nullif(btrim(venue_id), '')::uuid);

alter table public.calibration_feedback
	add constraint calibration_feedback_venue_id_fkey
	foreign key (venue_id)
	references public.venues(id)
	on delete set null;
