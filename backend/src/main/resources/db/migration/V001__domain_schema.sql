CREATE TABLE user_accounts (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE,
    display_name varchar(80) NOT NULL,
    password_hash varchar(255) NOT NULL,
    role varchar(10) NOT NULL,
    active boolean NOT NULL,
    must_change_password boolean NOT NULL,
    version bigint NOT NULL DEFAULT 0,
    auth_version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT user_email_normalized CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT user_display_name_length CHECK (char_length(display_name) BETWEEN 2 AND 80),
    CONSTRAINT user_password_hash_not_empty CHECK (char_length(password_hash) > 0),
    CONSTRAINT user_role_valid CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER')),
    CONSTRAINT user_versions_nonnegative CHECK (version >= 0 AND auth_version >= 0),
    CONSTRAINT user_timestamps_ordered CHECK (updated_at >= created_at)
);

CREATE TABLE issues (
    id uuid PRIMARY KEY,
    number bigserial NOT NULL UNIQUE,
    title varchar(160) NOT NULL,
    description text NOT NULL,
    title_search text NOT NULL,
    description_search text NOT NULL,
    type varchar(16) NOT NULL,
    priority varchar(8) NOT NULL,
    status varchar(16) NOT NULL,
    reporter_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    assignee_id uuid REFERENCES user_accounts(id) ON DELETE RESTRICT,
    due_date date,
    duplicate_of_id uuid REFERENCES issues(id) ON DELETE RESTRICT,
    archived boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    archived_by uuid REFERENCES user_accounts(id) ON DELETE RESTRICT,
    cycle_started_at timestamptz NOT NULL,
    resolved_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    last_activity_at timestamptz NOT NULL,
    version bigint NOT NULL DEFAULT 0,
    CONSTRAINT issue_number_positive CHECK (number > 0),
    CONSTRAINT issue_title_length CHECK (char_length(title) BETWEEN 3 AND 160),
    CONSTRAINT issue_description_length CHECK (char_length(description) BETWEEN 10 AND 10000),
    CONSTRAINT issue_search_lengths CHECK (char_length(title_search) BETWEEN 3 AND 320 AND char_length(description_search) BETWEEN 10 AND 20000),
    CONSTRAINT issue_type_valid CHECK (type IN ('QUESTION', 'BUG', 'DOCUMENTATION', 'FEATURE')),
    CONSTRAINT issue_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT issue_status_valid CHECK (status IN ('TODO', 'IN_PROGRESS', 'RESOLVED', 'DUPLICATE')),
    CONSTRAINT issue_duplicate_consistent CHECK ((status = 'DUPLICATE') = (duplicate_of_id IS NOT NULL)),
    CONSTRAINT issue_duplicate_not_self CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id),
    CONSTRAINT issue_resolution_consistent CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL)),
    CONSTRAINT issue_archive_consistent CHECK (
        (archived AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
        OR (NOT archived AND archived_at IS NULL AND archived_by IS NULL)
    ),
    CONSTRAINT issue_progress_requires_assignee CHECK (status <> 'IN_PROGRESS' OR assignee_id IS NOT NULL),
    CONSTRAINT issue_resolution_ordered CHECK (resolved_at IS NULL OR resolved_at >= cycle_started_at),
    CONSTRAINT issue_timestamps_ordered CHECK (updated_at >= created_at AND last_activity_at >= created_at AND cycle_started_at >= created_at),
    CONSTRAINT issue_archive_ordered CHECK (archived_at IS NULL OR archived_at >= created_at),
    CONSTRAINT issue_due_date_upper_limit CHECK (due_date IS NULL OR due_date <= DATE '2100-12-31'),
    CONSTRAINT issue_version_nonnegative CHECK (version >= 0)
);

CREATE TABLE labels (
    id uuid PRIMARY KEY,
    name varchar(32) NOT NULL,
    normalized_name varchar(64) NOT NULL UNIQUE,
    color varchar(8) NOT NULL,
    active boolean NOT NULL,
    version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT label_name_length CHECK (char_length(name) BETWEEN 1 AND 32 AND char_length(normalized_name) BETWEEN 1 AND 64),
    CONSTRAINT label_color_valid CHECK (color IN ('gray', 'blue', 'green', 'amber', 'red', 'purple')),
    CONSTRAINT label_version_nonnegative CHECK (version >= 0),
    CONSTRAINT label_timestamps_ordered CHECK (updated_at >= created_at)
);

CREATE TABLE issue_labels (
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    label_id uuid NOT NULL REFERENCES labels(id) ON DELETE RESTRICT,
    PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE issue_images (
    issue_id uuid PRIMARY KEY REFERENCES issues(id) ON DELETE RESTRICT,
    image_id uuid NOT NULL UNIQUE,
    original_name varchar(120) NOT NULL,
    content_type varchar(10) NOT NULL,
    content bytea NOT NULL,
    byte_size integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    sha256 char(64) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT image_name_length CHECK (char_length(original_name) BETWEEN 1 AND 120),
    CONSTRAINT image_content_type_valid CHECK (content_type IN ('image/png', 'image/jpeg')),
    CONSTRAINT image_size_valid CHECK (byte_size BETWEEN 1 AND 5242880 AND octet_length(content) = byte_size),
    CONSTRAINT image_dimensions_valid CHECK (width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND width::bigint * height <= 16000000),
    CONSTRAINT image_sha256_valid CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TABLE comments (
    id uuid PRIMARY KEY,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    author_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    body text NOT NULL,
    created_at timestamptz NOT NULL,
    sequence bigserial NOT NULL UNIQUE,
    CONSTRAINT comment_body_length CHECK (char_length(body) BETWEEN 1 AND 5000)
);

CREATE TABLE issue_events (
    id uuid PRIMARY KEY,
    event_sequence bigserial NOT NULL UNIQUE,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL,
    event_type varchar(40) NOT NULL,
    issue_version bigint,
    changes jsonb NOT NULL,
    snapshot jsonb,
    created_at timestamptz NOT NULL,
    CONSTRAINT issue_event_type_valid CHECK (event_type IN (
        'ISSUE_CREATED', 'FIELDS_UPDATED', 'ASSIGNMENT_CHANGED', 'STATE_CHANGED', 'COMMENT_ADDED',
        'IMAGE_CHANGED', 'LABELS_CHANGED', 'DEADLINE_CHANGED', 'ARCHIVED', 'RESTORED',
        'DUPLICATE_MARKED', 'DUPLICATE_UNDONE'
    )),
    CONSTRAINT issue_event_version_nonnegative CHECK (issue_version IS NULL OR issue_version >= 0),
    CONSTRAINT issue_event_changes_object CHECK (jsonb_typeof(changes) = 'object'),
    CONSTRAINT issue_event_snapshot_consistent CHECK (
        (event_type = 'ISSUE_CREATED' AND snapshot IS NOT NULL AND jsonb_typeof(snapshot) = 'object')
        OR (event_type <> 'ISSUE_CREATED' AND snapshot IS NULL)
    )
);

CREATE TABLE resolution_cycles (
    id uuid PRIMARY KEY,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    resolved_event_id uuid NOT NULL UNIQUE REFERENCES issue_events(id) ON DELETE RESTRICT,
    started_at timestamptz NOT NULL,
    resolved_at timestamptz NOT NULL,
    resolved_by_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    credited_assignee_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    duration_seconds numeric NOT NULL,
    CONSTRAINT resolution_times_ordered CHECK (resolved_at >= started_at),
    CONSTRAINT resolution_duration_consistent CHECK (
        duration_seconds >= 0 AND duration_seconds = extract(epoch FROM resolved_at - started_at)
    )
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    event_id uuid NOT NULL REFERENCES issue_events(id) ON DELETE RESTRICT,
    issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
    type varchar(16) NOT NULL,
    created_at timestamptz NOT NULL,
    read_at timestamptz,
    UNIQUE (recipient_id, event_id, type),
    CONSTRAINT notification_type_valid CHECK (type IN ('ASSIGNED', 'RESOLVED')),
    CONSTRAINT notification_read_ordered CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE TABLE account_events (
    id uuid PRIMARY KEY,
    actor_id uuid REFERENCES user_accounts(id) ON DELETE RESTRICT,
    subject_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL,
    event_type varchar(40) NOT NULL,
    changes jsonb NOT NULL,
    CONSTRAINT account_event_type_not_empty CHECK (char_length(event_type) > 0),
    CONSTRAINT account_event_changes_object CHECK (jsonb_typeof(changes) = 'object'),
    CONSTRAINT account_event_no_credentials CHECK (NOT changes ?| ARRAY[
        'password', 'passwordHash', 'password_hash', 'currentPassword', 'newPassword', 'temporaryPassword'
    ])
);

CREATE TABLE label_events (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    label_id uuid NOT NULL REFERENCES labels(id) ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL,
    event_type varchar(40) NOT NULL,
    changes jsonb NOT NULL,
    CONSTRAINT label_event_type_not_empty CHECK (char_length(event_type) > 0),
    CONSTRAINT label_event_changes_object CHECK (jsonb_typeof(changes) = 'object')
);

-- Audit, comments and completed cycles are append-only even for accidental owner updates.
CREATE FUNCTION reject_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER issue_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON issue_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER account_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON account_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER label_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON label_events
    FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER resolution_cycles_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON resolution_cycles
    FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER comments_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON comments
    FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_mutation();
