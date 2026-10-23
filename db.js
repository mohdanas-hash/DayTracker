
require("dotenv").config();

const { Pool, types } = require("pg");

// Keep PostgreSQL DATE values as YYYY-MM-DD strings.
// This prevents date-only values from shifting to the previous day.
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
    throw new Error(
        "DATABASE_URL is missing. Check your .env file."
    );
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(30) NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(120) NOT NULL,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            task_date DATE NOT NULL DEFAULT CURRENT_DATE,
            priority VARCHAR(10) NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high')),
            due_date DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Neon database tables are ready.");
}

module.exports = {
    pool,
    initializeDatabase
};
