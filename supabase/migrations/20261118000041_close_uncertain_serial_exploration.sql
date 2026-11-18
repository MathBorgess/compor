-- An explicitly closed serial exploration retains its unknown provider
-- result and original receipt. The closure timestamp is local to Compor.
alter table public.exploration_images
  add column closed_at timestamptz,
  drop constraint exploration_images_state_check,
  add constraint exploration_images_state_check
    check (state in ('running','unknown','completed','rejected','closed_unknown')),
  add constraint exploration_images_closure_check
    check ((state = 'closed_unknown' and parallel_batch_id is null
      and closed_at is not null and closed_at >= updated_at)
      or (state <> 'closed_unknown' and closed_at is null));

comment on column public.exploration_images.closed_at is
  'Local administrative closure of a serial exploration with an unknown provider result.';
