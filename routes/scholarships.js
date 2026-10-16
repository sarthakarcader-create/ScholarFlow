
const express = require("express");
const mysql = require("mysql2/promise");

const router = express.Router();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Administrator access required."
        });
    }

    next();
}

// Get all scholarships.
router.get("/", requireLogin, async (req, res) => {
    try {
        const [scholarships] = await db.execute(
            `SELECT scholarship_id, scholarship_name, eligibility, amount, deadline
             FROM Scholarships
             ORDER BY scholarship_id DESC`
        );

        res.json({
            success: true,
            scholarships
        });
    } catch (error) {
        console.error("Fetch scholarships error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not fetch scholarships."
        });
    }
});

// Add a scholarship.
router.post("/", requireAdmin, async (req, res) => {
    const { scholarship_name, eligibility, amount, deadline } = req.body;
    const scholarshipAmount = Number(amount);

    if (
        typeof scholarship_name !== "string" ||
        !scholarship_name.trim() ||
        typeof eligibility !== "string" ||
        !eligibility.trim() ||
        amount === "" ||
        amount === null ||
        amount === undefined ||
        !Number.isFinite(scholarshipAmount) ||
        scholarshipAmount <= 0 ||
        (
            deadline !== null &&
            deadline !== undefined &&
            deadline !== "" &&
            (
                typeof deadline !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
                Number.isNaN(Date.parse(deadline))
            )
        )
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid name, eligibility, positive amount and deadline."
        });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO Scholarships
                (scholarship_name, eligibility, amount, deadline)
             VALUES (?, ?, ?, ?)`,
            [
                scholarship_name.trim(),
                eligibility.trim(),
                scholarshipAmount,
                deadline || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Scholarship added successfully.",
            scholarship_id: result.insertId
        });
    } catch (error) {
        console.error("Add scholarship error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not add scholarship."
        });
    }
});

// Update a scholarship.
router.put("/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { scholarship_name, eligibility, amount, deadline } = req.body;
    const scholarshipAmount = Number(amount);

    if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        typeof scholarship_name !== "string" ||
        !scholarship_name.trim() ||
        typeof eligibility !== "string" ||
        !eligibility.trim() ||
        amount === "" ||
        amount === null ||
        amount === undefined ||
        !Number.isFinite(scholarshipAmount) ||
        scholarshipAmount <= 0 ||
        (
            deadline !== null &&
            deadline !== undefined &&
            deadline !== "" &&
            (
                typeof deadline !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(deadline) ||
                Number.isNaN(Date.parse(deadline))
            )
        )
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide valid scholarship details."
        });
    }

    try {
        const [result] = await db.execute(
            `UPDATE Scholarships
             SET scholarship_name = ?, eligibility = ?, amount = ?, deadline = ?
             WHERE scholarship_id = ?`,
            [
                scholarship_name.trim(),
                eligibility.trim(),
                scholarshipAmount,
                deadline || null,
                id
            ]
        );

        if (result.affectedRows === 0) {
            const [existing] = await db.execute(
                "SELECT scholarship_id FROM Scholarships WHERE scholarship_id = ?",
                [id]
            );

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Scholarship not found."
                });
            }
        }

        res.json({
            success: true,
            message: "Scholarship updated successfully."
        });
    } catch (error) {
        console.error("Update scholarship error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not update scholarship."
        });
    }
});

// Delete a scholarship.
router.delete("/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid scholarship ID."
        });
    }

    try {
        const [result] = await db.execute(
            "DELETE FROM Scholarships WHERE scholarship_id = ?",
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Scholarship not found."
            });
        }

        res.json({
            success: true,
            message: "Scholarship deleted successfully."
        });
    } catch (error) {
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                success: false,
                message: "This scholarship has applications and cannot be deleted."
            });
        }

        console.error("Delete scholarship error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not delete scholarship."
        });
    }
});

/* Student: Apply for a scholarship. */
router.post("/:id/apply", requireLogin, async (req, res) => {
    const scholarshipId = Number(req.params.id);
    const user = req.session.user;

    if (user.role !== "student" || !user.studentId) {
        return res.status(403).json({
            success: false,
            message: "Only students can apply for scholarships."
        });
    }

    if (!Number.isSafeInteger(scholarshipId) || scholarshipId < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid scholarship ID."
        });
    }

    try {
        const [users] = await db.execute(
            `SELECT account_status
             FROM Users
             WHERE user_id = ?
               AND student_id = ?
               AND role = 'student'`,
            [user.id, user.studentId]
        );

        if (users.length === 0 || users[0].account_status !== "approved") {
            return res.status(403).json({
                success: false,
                message: "Your student account is not approved."
            });
        }

        const [scholarships] = await db.execute(
            `SELECT scholarship_id, deadline
             FROM Scholarships
             WHERE scholarship_id = ?`,
            [scholarshipId]
        );

        if (scholarships.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Scholarship not found."
            });
        }

        const deadline = scholarships[0].deadline;

        if (deadline) {
            const today = new Date();
            const deadlineDate = new Date(deadline);

            const todayUTC = Date.UTC(
                today.getFullYear(),
                today.getMonth(),
                today.getDate()
            );

            const deadlineUTC = Date.UTC(
                deadlineDate.getFullYear(),
                deadlineDate.getMonth(),
                deadlineDate.getDate()
            );

            if (deadlineUTC < todayUTC) {
                return res.status(400).json({
                    success: false,
                    message: "The application deadline has passed."
                });
            }
        }

        const [result] = await db.execute(
            `INSERT INTO Applications
                (student_id, scholarship_id, apply_date, status)
             VALUES (?, ?, CURDATE(), 'Pending')`,
            [user.studentId, scholarshipId]
        );

        return res.status(201).json({
            success: true,
            message: "Scholarship application submitted successfully.",
            applicationId: result.insertId
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "You have already applied for this scholarship."
            });
        }

        console.error("Apply for scholarship error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not submit your application."
        });
    }
});

/* Student: View my applications. */
router.get("/my-applications", requireLogin, async (req, res) => {
    const user = req.session.user;

    if (user.role !== "student" || !user.studentId) {
        return res.status(403).json({
            success: false,
            message: "Only students can view their applications."
        });
    }

    try {
        const [users] = await db.execute(
            `SELECT account_status
             FROM Users
             WHERE user_id = ?
               AND student_id = ?
               AND role = 'student'`,
            [user.id, user.studentId]
        );

        if (users.length === 0 || users[0].account_status !== "approved") {
            return res.status(403).json({
                success: false,
                message: "Your student account is not approved."
            });
        }

        const [applications] = await db.execute(
            `SELECT
                A.application_id,
                A.scholarship_id,
                A.apply_date,
                A.status,
                S.scholarship_name,
                S.eligibility,
                S.amount,
                S.deadline
             FROM Applications A
             INNER JOIN Scholarships S
                ON A.scholarship_id = S.scholarship_id
             WHERE A.student_id = ?
             ORDER BY A.application_id DESC`,
            [user.studentId]
        );

        return res.json({
            success: true,
            applications
        });
    } catch (error) {
        console.error("Fetch applications error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not fetch your applications."
        });
    }
});

/* ================================
   ADMIN APPLICATION MANAGEMENT
================================ */

// Get all scholarship applications.
router.get("/admin/applications", requireAdmin, async (req, res) => {
    try {
        const [applications] = await db.query(`
            SELECT
                a.application_id,
                a.apply_date,
                a.status,
                s.student_name,
                s.institute,
                COALESCE(u.email, s.email) AS email,
                sc.scholarship_name,
                sc.amount
            FROM Applications a
            JOIN Students s
                ON a.student_id = s.student_id
            JOIN Scholarships sc
                ON a.scholarship_id = sc.scholarship_id
            LEFT JOIN Users u
                ON u.student_id = s.student_id
            ORDER BY a.apply_date DESC, a.application_id DESC
        `);

        res.json({
            success: true,
            applications
        });
    } catch (error) {
        console.error("Fetch applications error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch applications."
        });
    }
});

// Approve or reject a scholarship application.
router.patch(
    "/admin/applications/:id/status",
    requireAdmin,
    async (req, res) => {
        try {
            const applicationId = Number(req.params.id);
            const { status } = req.body;

            if (!Number.isInteger(applicationId) || applicationId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid application ID."
                });
            }

            if (!["Approved", "Rejected"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Status must be Approved or Rejected."
                });
            }

            const [result] = await db.query(
                `UPDATE Applications
                 SET status = ?
                 WHERE application_id = ?
                   AND status = 'Pending'`,
                [status, applicationId]
            );

            if (result.affectedRows === 0) {
                return res.status(409).json({
                    success: false,
                    message: "Application not found or already reviewed."
                });
            }

            res.json({
                success: true,
                message: `Application ${status.toLowerCase()} successfully.`
            });
        } catch (error) {
            console.error("Update application status error:", error);

            res.status(500).json({
                success: false,
                message: "Failed to update application status."
            });
        }
    }
);

/* ================================
   DISBURSEMENT MANAGEMENT
================================ */

// Get all disbursements (Admin only).
router.get("/admin/disbursements", requireAdmin, async (req, res) => {
    try {
        const [disbursements] = await db.query(`
            SELECT
                d.disbursement_id,
                d.application_id,
                d.payment_date,
                d.amount,
                d.status,
                s.student_name,
                COALESCE(u.email, s.email) AS email,
                sc.scholarship_name
            FROM Disbursements d
            JOIN Applications a
                ON d.application_id = a.application_id
            JOIN Students s
                ON a.student_id = s.student_id
            LEFT JOIN Users u
                ON u.student_id = s.student_id
            JOIN Scholarships sc
                ON a.scholarship_id = sc.scholarship_id
            ORDER BY d.disbursement_id DESC
        `);

        res.json({
            success: true,
            disbursements
        });
    } catch (error) {
        console.error("Fetch disbursements error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch disbursements."
        });
    }
});

// Create a disbursement for an approved application (Admin only).
router.post(
    "/admin/applications/:id/disbursement",
    requireAdmin,
    async (req, res) => {
        let connection;

        try {
            const applicationId = Number(req.params.id);

            if (!Number.isInteger(applicationId) || applicationId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid application ID."
                });
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [applications] = await connection.query(
                `SELECT a.application_id, a.status, sc.amount
                 FROM Applications a
                 JOIN Scholarships sc
                    ON a.scholarship_id = sc.scholarship_id
                 WHERE a.application_id = ?
                 FOR UPDATE`,
                [applicationId]
            );

            if (applications.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "Application not found."
                });
            }

            if (applications[0].status !== "Approved") {
                await connection.rollback();

                return res.status(400).json({
                    success: false,
                    message: "Only approved applications can be disbursed."
                });
            }

            await connection.query(
                `INSERT INTO Disbursements
                    (application_id, amount, status)
                 VALUES (?, ?, 'Pending')`,
                [applicationId, applications[0].amount]
            );

            await connection.commit();

            res.status(201).json({
                success: true,
                message: "Pending disbursement created successfully."
            });
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    success: false,
                    message: "A disbursement already exists for this application."
                });
            }

            console.error("Create disbursement error:", error);

            res.status(500).json({
                success: false,
                message: "Failed to create disbursement."
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

// Update disbursement status (Admin only).
router.patch(
    "/admin/disbursements/:id/status",
    requireAdmin,
    async (req, res) => {
        try {
            const disbursementId = Number(req.params.id);
            const { status } = req.body;

            if (!Number.isInteger(disbursementId) || disbursementId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid disbursement ID."
                });
            }

            if (!["Pending", "Paid", "Failed"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid disbursement status."
                });
            }

            const [result] = await db.query(
                `UPDATE Disbursements
                 SET status = ?,
                     payment_date = CASE
                         WHEN ? = 'Paid' THEN COALESCE(payment_date, CURDATE())
                         ELSE NULL
                     END
                 WHERE disbursement_id = ?`,
                [status, status, disbursementId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Disbursement not found."
                });
            }

            res.json({
                success: true,
                message: "Disbursement status updated successfully."
            });
        } catch (error) {
            console.error("Update disbursement status error:", error);

            res.status(500).json({
                success: false,
                message: "Failed to update disbursement."
            });
        }
    }
);

module.exports = router;
