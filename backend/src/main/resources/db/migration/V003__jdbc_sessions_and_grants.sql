-- Exact PostgreSQL schema packaged in org.springframework.session:spring-session-jdbc:4.1.1,
-- the Spring Session version managed by Spring Boot 4.1.1.
CREATE TABLE SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL,
    SESSION_ID CHAR(36) NOT NULL,
    CREATION_TIME BIGINT NOT NULL,
    LAST_ACCESS_TIME BIGINT NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME BIGINT NOT NULL,
    PRINCIPAL_NAME VARCHAR(100),
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36) NOT NULL,
    ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
    ATTRIBUTE_BYTES BYTEA NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID)
        REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bugboard_runtime') THEN
        RAISE EXCEPTION 'Provision bugboard_runtime before applying migrations';
    END IF;
    IF current_user = 'bugboard_runtime'
        OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bugboard_runtime' AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'Migration owner and unprivileged runtime role must be separate';
    END IF;
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM bugboard_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM bugboard_runtime;
REVOKE ALL ON FUNCTION reject_immutable_mutation() FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bugboard_runtime;
GRANT SELECT, INSERT, UPDATE ON user_accounts, issues, labels TO bugboard_runtime;
GRANT SELECT, INSERT, DELETE ON issue_labels TO bugboard_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_images TO bugboard_runtime;
GRANT SELECT, INSERT ON comments, issue_events, account_events, label_events, resolution_cycles TO bugboard_runtime;
GRANT SELECT, INSERT ON notifications TO bugboard_runtime;
GRANT UPDATE (read_at) ON notifications TO bugboard_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON SPRING_SESSION, SPRING_SESSION_ATTRIBUTES TO bugboard_runtime;
GRANT USAGE, SELECT ON SEQUENCE issues_number_seq, comments_sequence_seq, issue_events_event_sequence_seq TO bugboard_runtime;
