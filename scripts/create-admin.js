
require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");

async function main() {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    let connection;

    try {
        const name = (await rl.question("Admin name: ")).trim();
        const email = (await rl.question("Admin email: ")).trim().toLowerCase();
        const password = await rl.question("Admin password (min 12 chars): ");

        if (!name || !email || password.length < 12) {
            throw new Error("Name/email required; password must be at least 12 characters.");
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [existing] = await connection.execute(
            "SELECT user_id FROM Users WHERE email = ?",
            [email]
        );

        if (existing.length > 0) {
            throw new Error("An account with this email already exists.");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await connection.execute(
            `INSERT INTO Users
             (name, email, password_hash, role, account_status, student_id)
             VALUES (?, ?, ?, 'admin', 'approved', NULL)`,
            [name, email, passwordHash]
        );

        console.log("Admin account created successfully.");
    } finally {
        if (connection) {
            await connection.end();
        }

        rl.close();
    }
}

main().catch((error) => {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
});
