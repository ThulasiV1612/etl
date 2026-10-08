const { Pool, Client } = require('pg')

const config = require('../config/database')

const etlConfig = require('../config/etlUploadTypes')

const { syncMappingsToDatabase } = require('./etl/mappingSeedService')
const { logAudit, logError } = require('./logger')



let pool = null



function getPoolConfig() {
  return {
    ...config.db,
    max: 10,
  }
}



async function getPool() {

  if (!pool) {

    pool = new Pool(getPoolConfig())

  }

  return pool

}



async function initDatabase() {

  const adminClient = new Client(config.buildDbConfig('postgres'))

  await adminClient.connect()



  const dbCheck = await adminClient.query(

    'SELECT 1 FROM pg_database WHERE datname = $1',

    [config.db.database]

  )



  if (dbCheck.rows.length === 0) {

    await adminClient.query(`CREATE DATABASE "${config.db.database}"`)

  }



  await adminClient.end()



  const db = await getPool()



  await db.query(`

    CREATE TABLE IF NOT EXISTS companies (

      id SERIAL PRIMARY KEY,

      name VARCHAR(255) NOT NULL,

      status VARCHAR(50) DEFAULT 'ACTIVE',

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )

  `)



  await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)

  await db.query(`
    CREATE TABLE IF NOT EXISTS add_deal_form (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID,

      deal_name VARCHAR(500) NOT NULL,

      deal_type VARCHAR(100),

      deal_stage VARCHAR(100),

      sec_type VARCHAR(100),

      close_date DATE,

      owning_entity_name VARCHAR(500),

      funds_required_before_gp_sign DECIMAL(15, 2),

      auto_send_funding_instructions BOOLEAN DEFAULT FALSE,

      property_name VARCHAR(500),

      country VARCHAR(100),

      address_line_1 VARCHAR(500),

      address_line_2 VARCHAR(500),

      city VARCHAR(100),

      state VARCHAR(100),

      zip_code VARCHAR(20),

      asset_image_path VARCHAR(500),

      investor_summary_html TEXT,

      gallery_cover_image_url VARCHAR(500),

      key_highlights_json JSONB,

      deal_announcement_title VARCHAR(500),

      deal_announcement_message TEXT,

      offering_status VARCHAR(100),

      offering_visibility VARCHAR(100),

      show_on_investbase BOOLEAN DEFAULT FALSE,

      internal_name VARCHAR(500),

      offering_overview_asset_ids TEXT,

      offering_gallery_paths TEXT,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      offering_preview_token VARCHAR(255),

      offering_investor_preview_json JSONB,

      esign_templates_json JSONB,

      investor_questionnaire_json JSONB,

      funding_instructions_json JSONB,

      offering_overview_class_id INTEGER,
      attr_rows_json TEXT,
      additional_info_json TEXT

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS deals (

      id SERIAL PRIMARY KEY,

      company_id INTEGER REFERENCES companies(id),

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )

  `)



  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_lp_investor (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL,
      added_by INTEGER,
      contact_member_id INTEGER,
      investor_class VARCHAR(100),
      send_invitation_mail BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      profile_id INTEGER,
      email VARCHAR(255),
      role VARCHAR(100),
      committed_amount DECIMAL(15, 2),
      user_investor_profile_id INTEGER,
      doc_signed_date DATE,
      esign_status_json JSONB
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_member (
      id SERIAL PRIMARY KEY,
      deal_id VARCHAR(100) NOT NULL,
      added_by INTEGER,
      contact_member_id INTEGER,
      deal_member_role VARCHAR(100),
      send_invitation_mail BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS etl_media_uploads (
      media_id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      media_type VARCHAR(50) NOT NULL,
      document_section VARCHAR(200),
      deal_id VARCHAR(100),
      organization_id VARCHAR(100),
      original_name VARCHAR(500) NOT NULL,
      stored_name VARCHAR(500) NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      file_size BIGINT,
      mime_type VARCHAR(200),
      created_by VARCHAR(255) DEFAULT 'web-user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    ALTER TABLE etl_media_uploads
    ADD COLUMN IF NOT EXISTS document_section VARCHAR(200)
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS investors (
      id SERIAL PRIMARY KEY,
      deal_id VARCHAR(50) NOT NULL UNIQUE,
      investor_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      investment_amount DECIMAL(15, 2) NOT NULL,
      image_path VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_job_master (

      job_id SERIAL PRIMARY KEY,

      job_type VARCHAR(100) NOT NULL,

      file_name VARCHAR(500),

      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',

      start_time TIMESTAMP,

      end_time TIMESTAMP,

      total_records INTEGER DEFAULT 0,

      success_count INTEGER DEFAULT 0,

      failed_count INTEGER DEFAULT 0,

      created_by VARCHAR(255) DEFAULT 'system',

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_file_tracking (

      file_id SERIAL PRIMARY KEY,

      job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),

      file_name VARCHAR(500) NOT NULL,

      file_size BIGINT,

      file_path VARCHAR(1000),

      upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      file_status VARCHAR(50) DEFAULT 'UPLOADED'

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_stage_log (

      stage_log_id SERIAL PRIMARY KEY,

      job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),

      stage_name VARCHAR(50) NOT NULL,

      status VARCHAR(50) NOT NULL,

      start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      end_time TIMESTAMP,

      message TEXT

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_error_log (

      error_id SERIAL PRIMARY KEY,

      job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),

      row_number INTEGER,

      column_name VARCHAR(255),

      error_type VARCHAR(50),

      error_message TEXT NOT NULL,

      stack_trace TEXT,

      created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_record_status (

      record_status_id SERIAL PRIMARY KEY,

      job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),

      row_number INTEGER NOT NULL,

      status VARCHAR(50) NOT NULL,

      entity_id VARCHAR(100),

      error_message TEXT,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(job_id, row_number)

    )

  `)



  await db.query(`

    CREATE TABLE IF NOT EXISTS etl_column_mapping (

      mapping_id SERIAL PRIMARY KEY,

      upload_type VARCHAR(100) NOT NULL,

      excel_column_name VARCHAR(255) NOT NULL,

      database_column_name VARCHAR(255) NOT NULL,

      data_type VARCHAR(50) NOT NULL DEFAULT 'STRING',

      required_flag BOOLEAN DEFAULT FALSE,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(upload_type, excel_column_name)

    )

  `)



  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_asset (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      deal_id UUID NOT NULL REFERENCES add_deal_form(id) ON DELETE CASCADE,
      client_asset_id TEXT NOT NULL,
      property_name TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      street_address_1 TEXT NOT NULL DEFAULT '',
      street_address_2 TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      zip_code TEXT NOT NULL DEFAULT '',
      address_display TEXT NOT NULL DEFAULT '',
      asset_type TEXT NOT NULL DEFAULT '',
      image_count INTEGER NOT NULL DEFAULT 0,
      archived BOOLEAN NOT NULL DEFAULT FALSE,
      additional_info_json TEXT NOT NULL DEFAULT '[]',
      attr_rows_json TEXT NOT NULL DEFAULT '[]',
      image_preview_urls_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT deal_asset_deal_client_uidx UNIQUE (deal_id, client_asset_id)
    )
  `)

  const dealAssetCols = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deal_asset'
  `)
  const dealAssetColSet = new Set(dealAssetCols.rows.map((row) => row.column_name))
  if (dealAssetColSet.has('address_line_1') && !dealAssetColSet.has('street_address_1')) {
    await db.query('ALTER TABLE deal_asset RENAME COLUMN address_line_1 TO street_address_1')
  }
  if (dealAssetColSet.has('address_line_2') && !dealAssetColSet.has('street_address_2')) {
    await db.query('ALTER TABLE deal_asset RENAME COLUMN address_line_2 TO street_address_2')
  }
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS street_address_1 TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS street_address_2 TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS address_display TEXT NOT NULL DEFAULT ''`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS image_count INTEGER NOT NULL DEFAULT 0`)
  await db.query(`ALTER TABLE deal_asset ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT ''`)

  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS attr_rows_json TEXT
  `)
  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS additional_info_json TEXT
  `)
  await db.query(`
    ALTER TABLE add_deal_form
    ADD COLUMN IF NOT EXISTS class_setup_json TEXT
  `)

  await seedDefaultData(db)

  logAudit('Database initialized with ETL metadata and Syndication tables')

}



async function seedDefaultData(db) {
  const companyCheck = await db.query('SELECT id FROM companies LIMIT 1')
  if (!companyCheck.rows.length) {
    await db.query(`INSERT INTO companies (name, status) VALUES ('Default Company', 'ACTIVE')`)
  }

  await syncMappingsToDatabase(db)
}



module.exports = {

  initDatabase,

  getPool,

}

