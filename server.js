
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const { pool, initializeDatabase } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
    session({
        name: "daytracker.sid",
        secret:
            process.env.SESSION_SECRET ||
            crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

function today() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function validDueDate(value) {
    if (value === null || value === "") {
        return true;
    }

    if (typeof value !== "string") {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function validPriority(value) {
    return ["low", "medium", "high"].includes(value);
}

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    next();
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

// Register a new user
app.post("/api/register", async (req, res, next) => {
    try {
        let { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                error: "Username and password are required."
            });
        }

        username = username.trim().toLowerCase();

        if (!/^[a-z0-9_]{3,30}$/.test(username)) {
            return res.status(400).json({
                error:
                    "Username must be 3–30 characters using letters, numbers, or underscores."
            });
        }

        if (
            password.length < 8 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            return res.status(400).json({
                error:
                    "Password must be at least 8 characters and no more than 72 bytes."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (username, password_hash)
             VALUES ($1, $2)
             RETURNING id, username`,
            [username, passwordHash]
        );

        const user = result.rows[0];

        await regenerateSession(req);

        req.session.userId = user.id;
        req.session.username = user.username;

        await saveSession(req);

        res.status(201).json({
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "That username is already taken."
            });
        }

        next(error);
    }
});

// Log in
app.post("/api/login", async (req, res, next) => {
    try {
        let { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                error: "Username and password are required."
            });
        }

        username = username.trim().toLowerCase();

        const result = await pool.query(
            `SELECT id, username, password_hash
             FROM users
             WHERE username = $1`,
            [username]
        );

        const user = result.rows[0];

        if (
            !user ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            return res.status(401).json({
                error: "Invalid username or password."
            });
        }

        await regenerateSession(req);

        req.session.userId = user.id;
        req.session.username = user.username;

        await saveSession(req);

        res.json({
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get the logged-in user
app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Not logged in."
        });
    }

    res.json({
        user: {
            id: req.session.userId,
            username: req.session.username
        }
    });
});

// Log out
app.post("/api/logout", async (req, res, next) => {
    try {
        if (!req.session) {
            return res.json({ message: "Logged out." });
        }

        await new Promise((resolve, reject) => {
            req.session.destroy(error => {
                if (error) reject(error);
                else resolve();
            });
        });

        res.clearCookie("daytracker.sid", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production"
        });

        res.json({ message: "Logged out." });
    } catch (error) {
        next(error);
    }
});

// Get today's tasks for the logged-in user

app.get("/api/tasks/history", requireLogin, async (req, res, next) => {
    try {
        const selectedDate = req.query.date;

        // Validate the requested date.
        if (
            typeof selectedDate !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
        ) {
            return res.status(400).json({
                message: "Please provide a valid date in YYYY-MM-DD format."
            });
        }

        // Verify that the date actually exists on the calendar.
        const parsedDate = new Date(`${selectedDate}T00:00:00.000Z`);

        if (parsedDate.toISOString().slice(0, 10) !== selectedDate) {
            return res.status(400).json({
                message: "Invalid calendar date."
            });
        }

        const result = await pool.query(
            `SELECT id, user_id, title, completed,
                    task_date, priority, due_date, created_at
             FROM tasks
             WHERE user_id = $1
               AND task_date = $2::date
             ORDER BY
                CASE priority
                    WHEN 'high' THEN 1
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 3
                END,
                id DESC`,
            [req.session.userId, selectedDate]
        );

        res.json({ tasks: result.rows });
    } catch (error) {
        next(error);
    }
});

// Add a task
app.post("/api/tasks", requireLogin, async (req, res, next) => {
    try {
        const { title, priority = "medium", due_date = null } = req.body;

        if (
            typeof title !== "string" ||
            !title.trim() ||
            title.trim().length > 120
        ) {
            return res.status(400).json({
                error: "Task title must be between 1 and 120 characters."
            });
        }

        if (!validPriority(priority)) {
            return res.status(400).json({
                error: "Invalid task priority."
            });
        }

        if (!validDueDate(due_date)) {
            return res.status(400).json({
                error: "Please provide a valid due date."
            });
        }

        const result = await pool.query(
            `INSERT INTO tasks
                (user_id, title, task_date, priority, due_date)
             VALUES ($1, $2, $3::date, $4, $5::date)
             RETURNING *`,
            [
                req.session.userId,
                title.trim(),
                today(),
                priority,
                due_date || null
            ]
        );

        res.status(201).json({
            task: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
});

// Edit a task
app.patch("/api/tasks/:id", requireLogin, async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({
                error: "Invalid task ID."
            });
        }

        const { title, completed, priority, due_date } = req.body;
        const fields = [];
        const values = [];

        function addField(sql, value) {
            values.push(value);
            fields.push(`${sql} $${values.length}`);
        }

        if (Object.hasOwn(req.body, "title")) {
            if (
                typeof title !== "string" ||
                !title.trim() ||
                title.trim().length > 120
            ) {
                return res.status(400).json({
                    error: "Invalid task title."
                });
            }

            addField("title =", title.trim());
        }

        if (Object.hasOwn(req.body, "completed")) {
            if (typeof completed !== "boolean") {
                return res.status(400).json({
                    error: "Completed must be true or false."
                });
            }

            addField("completed =", completed);
        }

        if (Object.hasOwn(req.body, "priority")) {
            if (!validPriority(priority)) {
                return res.status(400).json({
                    error: "Invalid task priority."
                });
            }

            addField("priority =", priority);
        }

        if (Object.hasOwn(req.body, "due_date")) {
            if (!validDueDate(due_date)) {
                return res.status(400).json({
                    error: "Please provide a valid due date."
                });
            }

            addField("due_date =", due_date || null);
        }

        if (fields.length === 0) {
            return res.status(400).json({
                error: "No changes were provided."
            });
        }

        values.push(id);
        const idPosition = values.length;

        values.push(req.session.userId);
        const userPosition = values.length;

        values.push(today());
        const datePosition = values.length;

        const result = await pool.query(
            `UPDATE tasks
             SET ${fields.join(", ")}
             WHERE id = $${idPosition}
               AND user_id = $${userPosition}
               AND task_date = $${datePosition}::date
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Task not found."
            });
        }

        res.json({ task: result.rows[0] });
    } catch (error) {
        next(error);
    }
});

// Delete a task
app.delete("/api/tasks/:id", requireLogin, async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({
                error: "Invalid task ID."
            });
        }

        const result = await pool.query(
            `DELETE FROM tasks
             WHERE id = $1
               AND user_id = $2
               AND task_date = $3::date
             RETURNING id`,
            [id, req.session.userId, today()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Task not found."
            });
        }

        res.json({ message: "Task deleted." });
    } catch (error) {
        next(error);
    }
});

// Handle server errors
app.use((error, req, res, next) => {
    console.error("Server error:", error.message);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: "A server error occurred. Please try again."
    });
});

// Connect to Neon before starting the server
async function startServer() {
    try {
        await initializeDatabase();

        await pool.query("SELECT 1");

        app.listen(PORT, () => {
            console.log(`DayTracker running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Could not connect to Neon:", error.message);
        process.exit(1);
    }
}

startServer();
