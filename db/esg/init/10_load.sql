-- =========================
-- MINIMAL IMPORT (used)
-- =========================

-- RAW
COPY esg.companies (firm, isin, name, country, primary_sics_sector, year)
    FROM '/data/raw/companies.csv'
    WITH (FORMAT csv, HEADER true);

COPY esg.indicator_metadata
    FROM '/data/raw/indicator_metadata.csv'
    WITH (FORMAT csv, HEADER true);

-- PROCESSED (Main)
COPY esg.esg_indicators_postprocessed (
    company_id, year, company_year, data_point_id, data_point_description,
    model_output, model_output_valid, type_standard, value_final, unit_final
    )
    FROM '/data/processed/esg_indicators_postprocessed.csv'
    WITH (FORMAT csv, HEADER true);

-- OPTIONAL: sources (recommended, but you can comment out if you want)
-- COPY esg.reports_per_company_year (company_year, reports)
--     FROM '/data/processed/reports_per_company_year.csv'
--     WITH (FORMAT csv, HEADER true);

-- ==========================================================
-- FULL IMPORT (currently not used) - keep for later
-- ==========================================================
-- COPY esg.report_ids (report_id)
-- FROM '/data/raw/report_ids.csv'
-- WITH (FORMAT csv, HEADER true);
--
-- COPY esg.manual_validation_set
-- FROM '/data/raw/manual_validation_set.csv'
-- WITH (FORMAT csv, HEADER true);
--
-- COPY esg.manual_validation_set_annotator2
-- FROM '/data/raw/manual_validation_set_annotator2.csv'
-- WITH (FORMAT csv, HEADER true);
--
-- COPY esg.fed_rates_yearly
-- FROM '/data/raw/fed_rates_yearly.csv'
-- WITH (FORMAT csv, HEADER true, DELIMITER ';');
