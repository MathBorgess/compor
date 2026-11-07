-- Proposed: test with isolated identities before applying to a shared service.
create table public.exploration_plans (
  image_id uuid primary key references public.exploration_images(id),
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null references public.projects(id),
  composition text not null check (char_length(composition) between 1 and 300),
  contrast text not null check (char_length(contrast) between 1 and 300)
);
alter table public.exploration_plans enable row level security;
revoke all on public.exploration_plans from public,anon,authenticated;
grant select on public.exploration_plans to authenticated;
grant insert(image_id,project_id,composition,contrast) on public.exploration_plans to authenticated;
create policy exploration_plans_select on public.exploration_plans for select to authenticated using
  (owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy exploration_plans_insert on public.exploration_plans for insert to authenticated with check
  (owner_id=(select auth.uid()) and exists(select 1 from public.exploration_images e join public.projects p on p.id=e.project_id where e.id=exploration_plans.image_id and e.project_id=exploration_plans.project_id and e.owner_id=(select auth.uid()) and e.state='running' and p.owner_id=(select auth.uid())));

create table public.generated_image_signals (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id),
  project_id uuid not null references public.projects(id),
  image_id uuid not null references public.exploration_images(id),
  action text not null check (action in ('selected','rejected','comment')),
  comment text not null default '' check (char_length(comment)<=1000 and (action<>'comment' or char_length(trim(comment))>0)),
  supersedes uuid,
  created_at timestamptz not null default now(),
  unique (id,owner_id,project_id,image_id),
  foreign key (supersedes,owner_id,project_id,image_id) references public.generated_image_signals(id,owner_id,project_id,image_id),
  check (supersedes is distinct from id)
);
create index generated_image_signals_owner_time on public.generated_image_signals(owner_id,created_at desc,id desc);
alter table public.generated_image_signals enable row level security;
revoke all on public.generated_image_signals from public,anon,authenticated;
grant select on public.generated_image_signals to authenticated;
grant insert(id,project_id,image_id,action,comment,supersedes) on public.generated_image_signals to authenticated;
create policy generated_image_signals_select on public.generated_image_signals for select to authenticated using
  (owner_id=(select auth.uid()) and exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy generated_image_signals_insert on public.generated_image_signals for insert to authenticated with check
  (owner_id=(select auth.uid()) and exists(select 1 from public.exploration_images e join public.projects p on p.id=e.project_id where e.id=generated_image_signals.image_id and e.project_id=generated_image_signals.project_id and e.owner_id=(select auth.uid()) and e.state='completed' and p.owner_id=(select auth.uid())));
