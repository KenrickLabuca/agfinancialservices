# A&G Financial Services Lending System

React + Vite lending app with Supabase storage, ready for Vercel deployment.

## 1) Supabase setup

Create a Supabase project, then run this SQL in the SQL editor:

```sql
create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  application_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_loan_applications_updated_at on public.loan_applications;
create trigger trg_loan_applications_updated_at
before update on public.loan_applications
for each row execute function public.set_updated_at();

alter table public.loan_applications enable row level security;

create policy "Allow anon select" on public.loan_applications
for select to anon
using (true);

create policy "Allow anon insert" on public.loan_applications
for insert to anon
with check (true);

create policy "Allow anon update" on public.loan_applications
for update to anon
using (true)
with check (true);

create policy "Allow anon delete" on public.loan_applications
for delete to anon
using (true);
```

## 2) Environment variables

Copy `.env.example` to `.env` and fill values:

```bash
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 3) Run locally

```bash
npm install
npm run dev
```

## 4) Deploy to Vercel

1. Push project to GitHub.
2. Import the repo in Vercel.
3. Add these Environment Variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

Your saved applications will persist in Supabase (long-term cloud storage).
