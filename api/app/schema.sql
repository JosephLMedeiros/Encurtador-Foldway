-- Schema do encurtador (fonte única). Aplicado pela API na inicialização, de forma idempotente,
-- sob um advisory lock para que várias réplicas não migrem ao mesmo tempo.
-- Base: db-schema.sql revisado por Abby/Lucas.

CREATE TABLE IF NOT EXISTS links (
    id           SERIAL PRIMARY KEY,
    short_code   VARCHAR(50) UNIQUE NOT NULL,  -- UNIQUE já cria o índice
    original_url TEXT NOT NULL,
    clicks       INTEGER DEFAULT 0 NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE NULL
);

-- Definição única de "link ativo": nunca expira ou ainda não expirou.
-- A API (redirect e gauge kiro_active_links) e os painéis SQL do Grafana usam esta view.
CREATE OR REPLACE VIEW active_links AS
SELECT *
FROM links
WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP;

-- Log de cliques: base para analytics, ranking do "link do dia" e features exclusivas.
-- ip_address existe no contrato, mas a API não grava IP (LGPD).
CREATE TABLE IF NOT EXISTS click_events (
    id         SERIAL PRIMARY KEY,
    link_id    INTEGER REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_click_events_link_time ON click_events(link_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_time ON click_events(clicked_at DESC);

-- Origem do clique (header Referer), base para analytics das features exclusivas.
ALTER TABLE click_events ADD COLUMN IF NOT EXISTS referer TEXT;
