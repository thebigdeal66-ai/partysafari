update public.events
set status = 'published',
    start_time = start_time + interval '1800 years'
where id = 'e08cdf65-cecd-4c3e-9732-176a2b777e7b'
  and extract(year from start_time) = 226;
;
