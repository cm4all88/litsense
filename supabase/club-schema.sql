-- ─────────────────────────────────────────────────────────────────────────────
-- LitSense Club — Database Schema
-- Run in Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────────
-- Mirrors Stripe subscription state. Updated via webhook.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text NOT NULL UNIQUE,          -- Clerk user ID
  stripe_customer_id  text,
  stripe_sub_id       text,
  tier                text NOT NULL DEFAULT 'free'   -- 'free' | 'plus' | 'club'
                        CHECK (tier IN ('free','plus','club')),
  status              text NOT NULL DEFAULT 'active' -- 'active' | 'cancelled' | 'past_due' | 'trialing'
                        CHECK (status IN ('active','cancelled','past_due','trialing')),
  current_period_end  timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- ── MEMBERSHIP ENTITLEMENTS ───────────────────────────────────────────────────
-- Derived access rights per user. Recalculated on subscription change.
CREATE TABLE IF NOT EXISTS membership_entitlements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL UNIQUE,
  tier            text NOT NULL DEFAULT 'free',
  unlimited_sage  boolean DEFAULT false,
  full_shelves    boolean DEFAULT false,
  taste_memory    boolean DEFAULT false,
  reading_reports boolean DEFAULT false,
  monthly_entries integer DEFAULT 1,
  drop_access     text DEFAULT 'none'   -- 'none' | 'standard' | 'premium'
                    CHECK (drop_access IN ('none','standard','premium')),
  challenge_access boolean DEFAULT false,
  grand_prize_eligible boolean DEFAULT false,
  early_access    boolean DEFAULT false,
  updated_at      timestamptz DEFAULT now()
);

-- ── MONTHLY DROPS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_drops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key       text NOT NULL UNIQUE,  -- e.g. '2026-05'
  title           text NOT NULL,
  teaser_text     text NOT NULL,         -- shown before reveal / to locked tiers
  reveal_date     timestamptz NOT NULL,
  image_url       text,
  description     text,                  -- full description after reveal
  reward_type     text NOT NULL
                    CHECK (reward_type IN (
                      'ebook','discount','merch','gift_card',
                      'author_event','reading_challenge','digital_reward','mystery'
                    )),
  eligible_tiers  text[] NOT NULL DEFAULT ARRAY['plus','club'],
  claim_url       text,                  -- optional link to claim
  claim_label     text DEFAULT 'Claim',
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── DROP CLAIMS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_claims (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  drop_id     uuid NOT NULL REFERENCES monthly_drops(id) ON DELETE CASCADE,
  claimed_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, drop_id)
);

-- ── REWARD ENTRIES ────────────────────────────────────────────────────────────
-- Tracks monthly giveaway entries. Drawing logic is a future phase.
CREATE TABLE IF NOT EXISTS reward_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  month_key   text NOT NULL,             -- e.g. '2026-05'
  source      text NOT NULL              -- 'subscription' | 'challenge' | 'bonus'
                CHECK (source IN ('subscription','challenge','bonus')),
  entries     integer NOT NULL DEFAULT 1,
  note        text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, month_key, source)
);

-- ── READING CHALLENGES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reading_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id         uuid REFERENCES monthly_drops(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  prompt          text,                  -- e.g. "Read a book set in another country"
  eligible_tiers  text[] NOT NULL DEFAULT ARRAY['club'],
  reward_entries  integer DEFAULT 5,    -- bonus entries for completion
  start_date      timestamptz,
  end_date        timestamptz,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- ── CHALLENGE PROGRESS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  challenge_id    uuid NOT NULL REFERENCES reading_challenges(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled','in_progress','completed')),
  completed_at    timestamptz,
  book_id         text,                  -- book they read for the challenge
  note            text,                  -- user's note
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

-- ── GIVEAWAY DRAWINGS ─────────────────────────────────────────────────────────
-- Structure only — drawing logic is a future phase.
CREATE TABLE IF NOT EXISTS giveaway_drawings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key       text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','drawn','announced')),
  winner_user_id  text,
  winner_entries  integer,
  total_entries   integer,
  drawn_at        timestamptz,
  announced_at    timestamptz,
  prize_note      text,
  created_at      timestamptz DEFAULT now()
);

-- ── ADMIN SETTINGS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO admin_settings (key, value) VALUES
  ('club_enabled', 'true'),
  ('grand_prize_description', '"Reader of the Year — annual grand prize for Club members"'),
  ('current_month_key', to_jsonb(to_char(now(), 'YYYY-MM')))
ON CONFLICT (key) DO NOTHING;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE drop_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE giveaway_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Subscriptions: users read their own
CREATE POLICY "users_read_own_sub" ON subscriptions
  FOR SELECT USING (user_id = auth.uid()::text);

-- Entitlements: users read their own
CREATE POLICY "users_read_own_entitlements" ON membership_entitlements
  FOR SELECT USING (user_id = auth.uid()::text);

-- Monthly drops: anyone can read active drops (public catalog)
CREATE POLICY "anyone_read_active_drops" ON monthly_drops
  FOR SELECT USING (is_active = true);

-- Drop claims: users manage their own
CREATE POLICY "users_read_own_claims" ON drop_claims
  FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "users_insert_own_claims" ON drop_claims
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Reward entries: users read their own
CREATE POLICY "users_read_own_entries" ON reward_entries
  FOR SELECT USING (user_id = auth.uid()::text);

-- Challenges: anyone reads active
CREATE POLICY "anyone_read_active_challenges" ON reading_challenges
  FOR SELECT USING (is_active = true);

-- Challenge progress: users manage their own
CREATE POLICY "users_manage_own_progress" ON challenge_progress
  FOR ALL USING (user_id = auth.uid()::text);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON membership_entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_drops_month ON monthly_drops(month_key);
CREATE INDEX IF NOT EXISTS idx_drops_reveal ON monthly_drops(reveal_date);
CREATE INDEX IF NOT EXISTS idx_claims_user ON drop_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_claims_drop ON drop_claims(drop_id);
CREATE INDEX IF NOT EXISTS idx_entries_user_month ON reward_entries(user_id, month_key);
CREATE INDEX IF NOT EXISTS idx_progress_user ON challenge_progress(user_id);

-- ── UPDATED_AT TRIGGER ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_entitlements_updated
  BEFORE UPDATE ON membership_entitlements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_drops_updated
  BEFORE UPDATE ON monthly_drops FOR EACH ROW EXECUTE FUNCTION update_updated_at();
