CREATE SCHEMA IF NOT EXISTS esg;

-- 1) Companies (raw)
CREATE TABLE IF NOT EXISTS esg.companies
(
    firm
    UUID
    NOT
    NULL,
    isin
    TEXT,
    name
    TEXT,
    country
    TEXT,
    primary_sics_sector
    TEXT,
    year
    INT
    NOT
    NULL,
    PRIMARY
    KEY
(
    firm,
    year
)
    );

-- 2) Indicator metadata (raw)
CREATE TABLE IF NOT EXISTS esg.indicator_metadata
(
    id
    UUID
    PRIMARY
    KEY,
    topic
    TEXT,
    discl_req
    TEXT,
    discl_req_label
    TEXT,
    label
    TEXT,
    specification
    TEXT,
    context
    TEXT,
    type
    TEXT,
    srn_compliance_item_id
    TEXT,
    srn_compliance_item_type
    TEXT,
    label_specification
    TEXT,
    type_standard
    TEXT,
    refinitiv_fieldname
    TEXT,
    standard
    TEXT,
    standard_topic
    TEXT,
    id_num
    INT
);

-- 3) Main fact table (processed)
CREATE TABLE IF NOT EXISTS esg.esg_indicators_postprocessed
(
    row_id
    BIGSERIAL
    PRIMARY
    KEY,
    company_id
    UUID,
    year
    INT,
    company_year
    TEXT,
    data_point_id
    UUID,
    data_point_description
    TEXT,
    model_output
    TEXT,
    model_output_valid
    BOOLEAN,
    type_standard
    TEXT,
    value_final
    TEXT,
    unit_final
    TEXT
);

-- Helpful indexes for querying
CREATE INDEX IF NOT EXISTS idx_esg_ind_company_year
    ON esg.esg_indicators_postprocessed(company_id, year);

CREATE INDEX IF NOT EXISTS idx_esg_ind_datapoint
    ON esg.esg_indicators_postprocessed(data_point_id);

CREATE INDEX IF NOT EXISTS idx_companies_country_sector
    ON esg.companies(country, primary_sics_sector);

-- OPTIONAL (nice for explainability / “which reports were used”)
-- CREATE TABLE IF NOT EXISTS esg.reports_per_company_year
-- (
--     company_year
--     TEXT
--     PRIMARY
--     KEY,
--     reports
--     TEXT
-- );

-- ==========================================================
-- FULL IMPORT (currently not used) - keep for later
-- ==========================================================
-- CREATE TABLE IF NOT EXISTS esg.report_ids (report_id TEXT PRIMARY KEY);
--
-- CREATE TABLE IF NOT EXISTS esg.manual_validation_set (
--   data_point_id UUID,
--   company_year TEXT,
--   data_point_description TEXT,
--   corporate_reports TEXT,
--   search_keywords TEXT,
--   value TEXT,
--   unit TEXT,
--   value_reported TEXT,
--   unit_reported TEXT,
--   comment TEXT
-- );
--
-- CREATE TABLE IF NOT EXISTS esg.manual_validation_set_annotator2 (
--   data_point_id UUID,
--   company_year TEXT,
--   data_point_description TEXT,
--   corporate_reports TEXT,
--   search_keywords TEXT,
--   value TEXT,
--   unit TEXT,
--   value_reported TEXT,
--   unit_reported TEXT,
--   comment TEXT
-- );
--
-- CREATE TABLE IF NOT EXISTS esg.fed_rates_yearly (
--   time_period INT PRIMARY KEY,
--   eur_usd NUMERIC,
--   gbp_usd NUMERIC,
--   brl_usd NUMERIC,
--   cad_usd NUMERIC,
--   cny_usd NUMERIC,
--   dkk_usd NUMERIC,
--   nok_usd NUMERIC,
--   sek_usd NUMERIC,
--   sgd_usd NUMERIC,
--   chf_usd NUMERIC,
--   pln_usd NUMERIC
-- );
