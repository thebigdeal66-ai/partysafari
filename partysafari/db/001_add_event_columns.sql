-- Migration: add missing event fields to public.events
-- Run this against your Supabase database.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS genre text,
ADD COLUMN IF NOT EXISTS cover_image text,
ADD COLUMN IF NOT EXISTS ticket_link text,
ADD COLUMN IF NOT EXISTS gender_ratio_male integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS gender_ratio_female integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
