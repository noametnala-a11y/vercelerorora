-- Run this in the Supabase SQL editor (or via the CLI) before using the
-- security key / U2F login feature.

create table if not exists public.operator_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_id text unique not null,
  public_key text not null,        -- base64url-encoded COSE public key
  counter bigint not null default 0,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- This table is only ever read/written via the SUPABASE_SERVICE_ROLE_KEY in
-- server actions (app/operator/webauthn-actions.ts), never from the browser.
-- Enabling RLS with zero policies denies all access through the public
-- anon/auth keys, which is exactly what we want here.
alter table public.operator_credentials enable row level security;
