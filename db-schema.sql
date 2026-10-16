CREATE TABLE IF NOT EXISTS links (
    id           SERIAL PRIMARY KEY,
    short_code   VARCHAR(50) UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    clicks       INTEGER DEFAULT 0 NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE NULL
);

CREATE OR REPLACE VIEW active_links AS
SELECT *
FROM links
WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS click_events (
    id         SERIAL PRIMARY KEY,
    link_id    INTEGER REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_click_events_link_time ON click_events(link_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_click_events_time ON click_events(clicked_at DESC);