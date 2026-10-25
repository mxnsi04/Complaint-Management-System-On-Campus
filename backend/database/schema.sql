CREATE DATABASE IF NOT EXISTS campus_complaints;
USE campus_complaints;

CREATE TABLE IF NOT EXISTS category (
    category_id   INT           AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL UNIQUE,
    description   TEXT
);

INSERT INTO category (name, description) VALUES
('Academic', 'Teaching, curriculum, classroom, and faculty-related concerns'),
('Infrastructure', 'Buildings, classrooms, furniture, and campus facilities issues'),
('IT Support', 'Internet, portal, software, and lab systems related issues'),
('Hostel', 'Hostel room, maintenance, and amenities related concerns'),
('Transport', 'Bus routes, timing, safety, and transportation problems'),
('Sanitation', 'Cleanliness, washrooms, waste management, and hygiene concerns'),
('Security', 'Campus security, safety incidents, and access control concerns'),
('Administration', 'Office process, certificate, records, and administrative delays')
ON DUPLICATE KEY UPDATE
    description = VALUES(description);

CREATE TABLE IF NOT EXISTS student (
    student_id    INT           AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    phone         VARCHAR(15),
    department    VARCHAR(100),
    password_hash VARCHAR(255)  NOT NULL,
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
    staff_id      INT           AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    phone         VARCHAR(15),
    department    VARCHAR(100),
    password_hash VARCHAR(255)  NOT NULL,
    role          ENUM('admin','staff') DEFAULT 'staff',
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS complaint (
    complaint_id  INT           AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(200)  NOT NULL,
    description   TEXT          NOT NULL,
    status        ENUM('pending','open','in_progress','resolved','closed','rejected','reopened')
                                DEFAULT 'pending',
    priority      ENUM('low','medium','high','critical')
                                DEFAULT 'medium',
    date_filed    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    date_resolved DATETIME,
    student_id    INT           NOT NULL,
    category_id   INT           NOT NULL,
    staff_id      INT,
    CONSTRAINT fk_complaint_student  FOREIGN KEY (student_id)  REFERENCES student(student_id)  ON DELETE CASCADE,
    CONSTRAINT fk_complaint_category FOREIGN KEY (category_id) REFERENCES category(category_id),
    CONSTRAINT fk_complaint_staff    FOREIGN KEY (staff_id)    REFERENCES staff(staff_id)      ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS response (
    response_id     INT       AUTO_INCREMENT PRIMARY KEY,
    message         TEXT      NOT NULL,
    date_responded  DATETIME  DEFAULT CURRENT_TIMESTAMP,
    complaint_id    INT       NOT NULL,
    staff_id        INT       NOT NULL,
    CONSTRAINT fk_response_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
    CONSTRAINT fk_response_staff     FOREIGN KEY (staff_id)     REFERENCES staff(staff_id)
);

CREATE TABLE IF NOT EXISTS feedback (
    feedback_id   INT       AUTO_INCREMENT PRIMARY KEY,
    message       TEXT,
    rating        TINYINT   CHECK (rating BETWEEN 1 AND 5),
    date          DATETIME  DEFAULT CURRENT_TIMESTAMP,
    complaint_id  INT       NOT NULL UNIQUE,
    student_id    INT       NOT NULL,
    CONSTRAINT fk_feedback_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_student   FOREIGN KEY (student_id)   REFERENCES student(student_id)
);

CREATE TABLE IF NOT EXISTS complaint_audit (
    audit_id       INT       AUTO_INCREMENT PRIMARY KEY,
    complaint_id   INT,
    old_status     VARCHAR(50),
    new_status     VARCHAR(50),
    changed_at     DATETIME  DEFAULT CURRENT_TIMESTAMP
);

-- Workflow 3: Real-Time Chat
CREATE TABLE IF NOT EXISTS chat_message (
    message_id    INT           AUTO_INCREMENT PRIMARY KEY,
    complaint_id  INT           NOT NULL,
    sender_id     INT           NOT NULL,
    sender_role   ENUM('student','staff','admin') NOT NULL,
    message       TEXT          NOT NULL,
    sent_at       DATETIME      DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW vw_open_complaints AS
SELECT
    c.complaint_id,
    c.title,
    c.status,
    c.priority,
    c.date_filed,
    s.name        AS student_name,
    s.department  AS student_dept,
    cat.name      AS category,
    IFNULL(st.name, 'Unassigned') AS assigned_to
FROM complaint c
JOIN student  s   ON c.student_id  = s.student_id
JOIN category cat ON c.category_id = cat.category_id
LEFT JOIN staff st ON c.staff_id   = st.staff_id
WHERE c.status NOT IN ('resolved', 'closed', 'rejected');

CREATE OR REPLACE VIEW vw_student_complaint_history AS
SELECT
    s.student_id,
    s.name          AS student_name,
    s.department,
    c.complaint_id,
    c.title,
    c.status,
    c.priority,
    cat.name        AS category,
    c.date_filed,
    c.date_resolved,
    IFNULL(f.rating, 'No Feedback') AS feedback_rating
FROM student s
JOIN complaint c  ON s.student_id  = c.student_id
JOIN category cat ON c.category_id = cat.category_id
LEFT JOIN feedback f ON c.complaint_id = f.complaint_id;

CREATE OR REPLACE VIEW vw_staff_workload AS
SELECT
    st.staff_id,
    st.name         AS staff_name,
    st.department,
    COUNT(c.complaint_id)                               AS total_assigned,
    SUM(c.status = 'resolved')                          AS resolved,
    SUM(c.status IN ('open','in_progress','pending'))   AS pending_open,
    ROUND(AVG(f.rating), 2)                             AS avg_feedback_rating
FROM staff st
LEFT JOIN complaint c ON st.staff_id = c.staff_id
LEFT JOIN feedback  f ON c.complaint_id = f.complaint_id
GROUP BY st.staff_id, st.name, st.department;

CREATE OR REPLACE VIEW vw_category_stats AS
SELECT
    cat.name                                        AS category,
    COUNT(c.complaint_id)                           AS total,
    SUM(c.status = 'resolved')                      AS resolved,
    SUM(c.status = 'pending')                       AS pending,
    SUM(c.status = 'in_progress')                   AS in_progress,
    ROUND(SUM(c.status = 'resolved') * 100.0 /
          NULLIF(COUNT(c.complaint_id), 0), 1)      AS resolution_rate_pct
FROM category cat
LEFT JOIN complaint c ON cat.category_id = c.category_id
GROUP BY cat.category_id, cat.name;

DROP TRIGGER IF EXISTS trg_set_resolved_date;
DROP TRIGGER IF EXISTS trg_feedback_only_on_resolved;
DROP TRIGGER IF EXISTS trg_audit_status_change;
DROP TRIGGER IF EXISTS trg_auto_open_on_assign;
DROP TRIGGER IF EXISTS trg_reopen_on_low_feedback;

DELIMITER $$

CREATE TRIGGER trg_set_resolved_date
BEFORE UPDATE ON complaint
FOR EACH ROW
BEGIN
    IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
        SET NEW.date_resolved = NOW();
    END IF;

    IF NEW.status != 'resolved' AND OLD.status = 'resolved' THEN
        SET NEW.date_resolved = NULL;
    END IF;
END$$

CREATE TRIGGER trg_feedback_only_on_resolved
BEFORE INSERT ON feedback
FOR EACH ROW
BEGIN
    DECLARE complaint_status VARCHAR(50);

    SELECT status INTO complaint_status
    FROM complaint WHERE complaint_id = NEW.complaint_id;

    IF complaint_status != 'resolved' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Feedback can only be submitted for resolved complaints.';
    END IF;
END$$

CREATE TRIGGER trg_audit_status_change
AFTER UPDATE ON complaint
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO complaint_audit (complaint_id, old_status, new_status)
        VALUES (NEW.complaint_id, OLD.status, NEW.status);
    END IF;
END$$

CREATE TRIGGER trg_auto_open_on_assign
BEFORE UPDATE ON complaint
FOR EACH ROW
BEGIN
    IF NEW.staff_id IS NOT NULL AND OLD.staff_id IS NULL
       AND NEW.status = 'pending' THEN
        SET NEW.status = 'open';
    END IF;
END$$

-- Workflow 2: Feedback Loop - Auto-Reopen on rating < 2
CREATE TRIGGER trg_reopen_on_low_feedback
AFTER INSERT ON feedback
FOR EACH ROW
BEGIN
    IF NEW.rating < 2 THEN
        UPDATE complaint SET status = 'reopened' WHERE complaint_id = NEW.complaint_id;
        INSERT INTO complaint_audit (complaint_id, old_status, new_status)
        VALUES (NEW.complaint_id, 'resolved', 'reopened');
    END IF;
END$$

DELIMITER ;
