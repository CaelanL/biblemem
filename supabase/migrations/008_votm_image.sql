-- Add image_url column to verse_of_month table
ALTER TABLE verse_of_month ADD COLUMN image_url TEXT;

-- Create storage bucket for VOTM images (run this in SQL editor or create via dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('votm-images', 'votm-images', true);
