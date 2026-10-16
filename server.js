
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");
const path = require("path");

const authRoutes = require("./routes/auth");
const scholarshipRoutes = require("./routes/scholarships");

const app = express();

app.disable("x-powered-by");

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));

const dbConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// MySQL connection pool for application queries.
const db = mysqlPromise.createPool(dbConfig);

// MySQL-backed session store.
const sessionConnection = mysql.createPool(dbConfig);

const sessionStore = new MySQLStore(
    {
        createDatabaseTable: true,
        clearExpired: true,
        checkExpirationInterval: 15 * 60 * 1000
    },
    sessionConnection
);

app.use(
    session({
        name: "scholarflow.sid",
        secret: process.env.SESSION_SECRET,
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 4
        }
    })
);

// API routes.
app.use("/api/auth", authRoutes);
app.use("/api/scholarships", scholarshipRoutes);

// Admin dashboard statistics.
app.get("/api/admin/stats", async (req, res) => {
    try {
        if (
            !req.session.user ||
            req.session.user.role !== "admin"
        ) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const [students] = await db.query(
            "SELECT COUNT(*) AS total FROM Students"
        );

        const [applications] = await db.query(
            "SELECT COUNT(*) AS total FROM Applications"
        );

        res.json({
            totalStudents: students[0].total,
            totalApplications: applications[0].total
        });
    } catch (error) {
        console.error("Stats error:", error);

        res.status(500).json({
            message: "Failed to load statistics"
        });
    }
});

// Protect admin dashboard.
app.get("/admin.html", (req, res) => {
    if (
        !req.session.user ||
        req.session.user.role !== "admin"
    ) {
        return res.redirect("/login.html");
    }

    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Protect student dashboard.
app.get("/student.html", (req, res) => {
    if (
        !req.session.user ||
        req.session.user.role !== "student"
    ) {
        return res.redirect("/login.html");
    }

    res.sendFile(path.join(__dirname, "public", "student.html"));
});

// Database health check.
app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT DATABASE() AS database_name"
        );

        res.json({
            success: true,
            database: rows[0].database_name
        });
    } catch (error) {
        console.error("Database error:", error.message);

        res.status(500).json({
            success: false,
            message: "Database connection failed."
        });
    }
});

// Serve public frontend files.
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(
        `ScholarFlow running on http://localhost:${PORT}`
    );
});
