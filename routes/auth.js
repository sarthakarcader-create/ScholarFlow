
const express = require("express");
const bcrypt = require("bcrypt");
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

// Require a logged-in user.
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please log in first."
        });
    }

    next();
}

// Require an administrator.
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

// Student registration.
router.post("/register", async (req, res) => {
    const { name, email, password, institute } = req.body;

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        typeof institute !== "string" ||
        !name.trim() ||
        !email.trim() ||
        !institute.trim() ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return res.status(400).json({
            success: false,
            message: "Enter valid details. Password must be 8–72 bytes."
        });
    }

    let connection;

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const passwordHash = await bcrypt.hash(password, 12);

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.execute(
            "SELECT user_id FROM Users WHERE email = ?",
            [normalizedEmail]
        );

        if (existing.length > 0) {
            await connection.rollback();

            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const [studentResult] = await connection.execute(
            `INSERT INTO Students (student_name, email, institute)
             VALUES (?, ?, ?)`,
            [name.trim(), normalizedEmail, institute.trim()]
        );

        await connection.execute(
            `INSERT INTO Users
             (name, email, password_hash, role, account_status, student_id)
             VALUES (?, ?, ?, 'student', 'pending', ?)`,
            [
                name.trim(),
                normalizedEmail,
                passwordHash,
                studentResult.insertId
            ]
        );

        await connection.commit();

        return res.status(201).json({
            success: true,
            message: "Registration submitted. Please wait for admin approval."
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error("Registration error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Login.
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    try {
        const [users] = await db.execute(
            `SELECT user_id, name, email, password_hash,
                    role, account_status, student_id
             FROM Users
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = users[0];
        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.account_status !== "approved") {
            return res.status(403).json({
                success: false,
                message: user.account_status === "pending"
                    ? "Your account is awaiting admin approval."
                    : "Your account has not been approved."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Session error:", error.message);

                return res.status(500).json({
                    success: false,
                    message: "Unable to start a session."
                });
            }

            req.session.user = {
                id: user.user_id,
                name: user.name,
                email: user.email,
                role: user.role,
                studentId: user.student_id
            };

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Session save error:", saveError.message);

                    return res.status(500).json({
                        success: false,
                        message: "Unable to save your session."
                    });
                }

                return res.json({
                    success: true,
                    message: "Login successful.",
                    user: req.session.user,
                    redirect: user.role === "admin"
                        ? "/admin.html"
                        : "/student.html"
                });
            });
        });
    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Login failed. Please try again."
        });
    }
});

// Get the current logged-in user.
router.get("/me", requireLogin, (req, res) => {
    res.json({
        success: true,
        user: req.session.user
    });
});

// Logout.
router.post("/logout", requireLogin, (req, res, next) => {
    req.session.destroy((error) => {
        if (error) {
            return next(error);
        }

        res.clearCookie("scholarflow.sid", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/"
        });

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

// Admin: list registrations awaiting approval.

router.get("/admin/pending", requireAdmin, async (req, res) => {
    try {
        const [users] = await db.execute(
            `SELECT
                Users.user_id,
                Users.name,
                Users.email,
                Users.student_id,
                Users.created_at,
                Students.institute
             FROM Users
             LEFT JOIN Students
                ON Users.student_id = Students.student_id
             WHERE Users.role = 'student'
               AND Users.account_status = 'pending'
             ORDER BY Users.created_at ASC`
        );

        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error("Pending users error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load pending registrations."
        });
    }
});


// Admin: approve or reject a student registration.
router.patch("/admin/users/:id/status", requireAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    const status = req.body.status;

    if (
        !Number.isSafeInteger(userId) ||
        userId < 1 ||
        !["approved", "rejected"].includes(status)
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide a valid student ID and status."
        });
    }

    try {
        const [result] = await db.execute(
            `UPDATE Users
             SET account_status = ?
             WHERE user_id = ?
               AND role = 'student'
               AND account_status = 'pending'`,
            [status, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Pending student account not found."
            });
        }

        res.json({
            success: true,
            message: `Student registration ${status}.`
        });
    } catch (error) {
        console.error("Approval error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not update registration."
        });
    }
});

module.exports = router;
