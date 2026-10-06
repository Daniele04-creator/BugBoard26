CREATE TABLE idempotency_records (
    actor_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
    key uuid NOT NULL,
    operation varchar(160) NOT NULL,
    request_hash char(64) NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    resource_id uuid NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (actor_id, key),
    CONSTRAINT idempotency_operation_not_empty CHECK (char_length(operation) > 0),
    CONSTRAINT idempotency_hash_valid CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT idempotency_status_valid CHECK (response_status BETWEEN 200 AND 299),
    CONSTRAINT idempotency_response_object CHECK (jsonb_typeof(response_body) = 'object'),
    CONSTRAINT idempotency_expiry_ordered CHECK (expires_at > created_at)
);

CREATE TABLE login_attempts (
    scope_hash char(64) PRIMARY KEY,
    scope varchar(5) NOT NULL,
    window_started_at timestamptz NOT NULL,
    failure_count integer NOT NULL,
    blocked_until timestamptz,
    expires_at timestamptz NOT NULL,
    CONSTRAINT login_scope_hash_valid CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT login_scope_valid CHECK (scope IN ('EMAIL', 'IP')),
    CONSTRAINT login_failures_nonnegative CHECK (failure_count >= 0),
    CONSTRAINT login_expiry_ordered CHECK (expires_at > window_started_at),
    CONSTRAINT login_block_ordered CHECK (blocked_until IS NULL OR blocked_until >= window_started_at)
);

CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);
CREATE INDEX login_attempts_expiry_idx ON login_attempts (expires_at);
GRANT SELECT, INSERT, DELETE ON idempotency_records TO bugboard_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON login_attempts TO bugboard_runtime;
