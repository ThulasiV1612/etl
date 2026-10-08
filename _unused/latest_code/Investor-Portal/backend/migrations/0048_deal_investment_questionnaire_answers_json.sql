ALTER TABLE deal_investment
ADD COLUMN IF NOT EXISTS investor_questionnaire_answers_json text;
