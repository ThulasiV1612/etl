-- ETL Metadata Tables for Syndication ETL Framework
-- Auto-created by backend/services/dbService.js on startup

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
);

CREATE TABLE IF NOT EXISTS etl_file_tracking (
  file_id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  file_path VARCHAR(1000),
  upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_status VARCHAR(50) DEFAULT 'UPLOADED'
);

CREATE TABLE IF NOT EXISTS etl_stage_log (
  stage_log_id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),
  stage_name VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  message TEXT
);

CREATE TABLE IF NOT EXISTS etl_error_log (
  error_id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES etl_job_master(job_id),
  row_number INTEGER,
  column_name VARCHAR(255),
  error_type VARCHAR(50),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS etl_column_mapping (
  mapping_id SERIAL PRIMARY KEY,
  upload_type VARCHAR(100) NOT NULL,
  excel_column_name VARCHAR(255) NOT NULL,
  database_column_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50) NOT NULL DEFAULT 'STRING',
  required_flag BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(upload_type, excel_column_name)
);
