-- Ottomate — Supabase schema
-- Run this in the Supabase SQL Editor after creating your project.
-- This is a sync mirror of the local SQLite schema.
-- RLS (Row Level Security) is enabled on all tables.

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id          text primary key,
  email       text unique not null,
  name        text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

-- Users can only read their own row
create policy "users: read own" on public.users
  for select using (id = auth.uid()::text);

-- ─── Subscriptions ───────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id                       text primary key default gen_random_uuid()::text,
  user_id                  text not null references public.users(id) on delete cascade,
  tier                     text not null default 'free',
  status                   text not null default 'active',
  tasks_used_this_month    integer not null default 0,
  usage_reset_at           timestamptz not null default now(),
  stripe_customer_id       text,
  stripe_subscription_id   text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (user_id)
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: read own" on public.subscriptions
  for select using (user_id = auth.uid()::text);

-- ─── Gift codes ───────────────────────────────────────────────────────────────

create table if not exists public.gift_codes (
  id              text primary key default gen_random_uuid()::text,
  code            text unique not null,
  tier            text not null,             -- tier to grant on redemption
  duration_days   integer not null,          -- how many days of the tier
  created_by      text references public.users(id),
  redeemed_by     text references public.users(id),
  redeemed_at     timestamptz,
  expires_at      timestamptz,               -- null = never expires
  created_at      timestamptz not null default now()
);

alter table public.gift_codes enable row level security;

-- Admins can do everything; regular users can only select (to redeem)
create policy "gift_codes: read all" on public.gift_codes
  for select using (true);

-- Only service role (via supabaseAdmin) inserts/updates — no direct user writes

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_gift_codes_code on public.gift_codes(code);
create index if not exists idx_gift_codes_redeemed_by on public.gift_codes(redeemed_by);
