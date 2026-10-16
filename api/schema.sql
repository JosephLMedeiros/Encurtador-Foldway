-- Kiro Portal — schema.sql (versão revisada por Abby / SRE)
-- Base: rascunho gerado pelo Gemini. As alterações estão marcadas com [MUDANÇA].

CREATE TABLE IF NOT EXISTS links (
    id           SERIAL PRIMARY KEY,
    short_code   VARCHAR(50) UNIQUE NOT NULL,  -- UNIQUE já cria um índice automaticamente
    original_url TEXT NOT NULL,
    clicks       INTEGER DEFAULT 0 NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,  -- [MUDANÇA] NOT NULL
    expires_at   TIMESTAMP WITH TIME ZONE NULL
);

-- [MUDANÇA] Removido o índice idx_links_short_code: era redundante com o UNIQUE acima
-- e só deixaria as escritas mais lentas.

-- [MUDANÇA] Definição única de "link ativo": nunca expira ou ainda não expirou.
-- A API (gauge kiro_active_links e decisão de redirecionar) e qualquer painel SQL
-- do Grafana devem consultar esta view, em vez de repetir a regra.
CREATE OR REPLACE VIEW active_links AS
SELECT *
FROM links
WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP;

-- Log de cliques (alimenta painéis SQL no Grafana, como o ranking do "link do dia")
-- Obs.: ip_address é dado pessoal (LGPD). Se não for essencial, não gravar ou truncar o IP.
CREATE TABLE IF NOT EXISTS click_events (
    id         SERIAL PRIMARY KEY,
    link_id    INTEGER REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,  -- [MUDANÇA] NOT NULL
    user_agent TEXT,
    ip_address VARCHAR(45)
);

-- [MUDANÇA] Índice composto no lugar do índice só em link_id:
-- atende "cliques de um link ao longo do tempo" e também as buscas por link_id.
DROP INDEX IF EXISTS idx_click_events_link_id;
CREATE INDEX IF NOT EXISTS idx_click_events_link_time ON click_events(link_id, clicked_at DESC);

-- [MUDANÇA] Índice por tempo, para painéis "cliques nos últimos N minutos/horas".
CREATE INDEX IF NOT EXISTS idx_click_events_time ON click_events(clicked_at DESC);
