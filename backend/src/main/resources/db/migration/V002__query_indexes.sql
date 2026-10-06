CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX issues_archive_created_idx ON issues (archived, created_at DESC, id);
CREATE INDEX issues_assignee_work_idx ON issues (assignee_id, archived, status);
CREATE INDEX issues_reporter_created_idx ON issues (reporter_id, created_at);
CREATE INDEX issues_duplicate_target_idx ON issues (duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;
CREATE INDEX issues_open_due_date_idx ON issues (due_date, id)
    WHERE archived = false AND status IN ('TODO', 'IN_PROGRESS');
CREATE INDEX issues_title_search_idx ON issues USING gin (title_search gin_trgm_ops);
CREATE INDEX issues_description_search_idx ON issues USING gin (description_search gin_trgm_ops);
CREATE INDEX issue_labels_label_issue_idx ON issue_labels (label_id, issue_id);
CREATE INDEX comments_issue_chronology_idx ON comments (issue_id, created_at, sequence);
CREATE INDEX issue_events_issue_chronology_idx ON issue_events (issue_id, occurred_at, event_sequence);
CREATE INDEX issue_events_reporting_idx ON issue_events (occurred_at, event_type, issue_id);
CREATE INDEX resolution_cycles_reporting_idx ON resolution_cycles (resolved_at, credited_assignee_id);
CREATE INDEX resolution_cycles_issue_idx ON resolution_cycles (issue_id, resolved_at);
CREATE INDEX notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC, id);
CREATE INDEX notifications_unread_idx ON notifications (recipient_id, created_at DESC, id) WHERE read_at IS NULL;
