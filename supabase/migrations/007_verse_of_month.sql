-- Verse of the Month table
-- Stores monthly verse challenges that all users can participate in

CREATE TABLE verse_of_month (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,  -- Format: "2024-12", "2025-01"
  book TEXT NOT NULL,
  chapter INT NOT NULL,
  verse_start INT NOT NULL,
  verse_end INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Everyone can read (including anonymous)
ALTER TABLE verse_of_month ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read VOTM"
  ON verse_of_month
  FOR SELECT
  USING (true);

-- Note: Insert/update is restricted to service role (admin only via dashboard or API)

-- Index for quick lookup by month
CREATE INDEX idx_votm_year_month ON verse_of_month(year_month);
