
const authSection = document.getElementById("authSection");
const dashboardSection = document.getElementById("dashboardSection");
const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const authDescription = document.getElementById("authDescription");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const userDisplay = document.getElementById("userDisplay");
const logoutButton = document.getElementById("logoutButton");

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskPriority = document.getElementById("taskPriority");
const taskDueDate = document.getElementById("taskDueDate");
const taskList = document.getElementById("taskList");
const emptyMessage = document.getElementById("emptyMessage");
const taskMessage = document.getElementById("taskMessage");

let authMode = "login";
let currentUser = null;
let tasks = [];

// Send requests to the backend API.
async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (response.status === 401 && url !== "/api/login") {
            showLoggedOut();
        }

        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

// Switch between login and registration.
function setAuthMode(mode) {
    authMode = mode;

    const isLogin = mode === "login";

    authTitle.textContent = isLogin
        ? "Welcome back"
        : "Create your account";

    authDescription.textContent = isLogin
        ? "Log in to continue tracking your day."
        : "Register to start tracking your daily progress.";

    authSubmit.textContent = isLogin ? "Log in" : "Create account";

    passwordInput.autocomplete = isLogin
        ? "current-password"
        : "new-password";

    loginTab.classList.toggle("active", isLogin);
    registerTab.classList.toggle("active", !isLogin);

    authMessage.textContent = "";
}

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));

// Display the login screen.
function showLoggedOut() {
    currentUser = null;
    tasks = [];

    authSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    logoutButton.classList.add("hidden");

    userDisplay.textContent = "";
    taskList.replaceChildren();
}

// Display the dashboard.
function showDashboard(user) {
    currentUser = user;

    authSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    logoutButton.classList.remove("hidden");

    userDisplay.textContent = `Hello, ${user.username}`;

    document.getElementById("todayDate").textContent =
        new Date().toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        });
}

// Login or register.
authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    authMessage.textContent = "";
    authSubmit.disabled = true;

    try {
        const data = await api(`/api/${authMode}`, {
            method: "POST",
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                password: passwordInput.value
            })
        });

        passwordInput.value = "";

        showDashboard(data.user);
        await loadTasks();
    } catch (error) {
        authMessage.textContent = error.message;
    } finally {
        authSubmit.disabled = false;
    }
});

// Log out.
logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        await api("/api/logout", { method: "POST" });

        showLoggedOut();
        setAuthMode("login");
        passwordInput.value = "";
    } catch (error) {
        alert(error.message);
    } finally {
        logoutButton.disabled = false;
    }
});

// Add a task with its priority and optional due date.
taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    taskMessage.textContent = "";

    const title = taskInput.value.trim();

    if (!title) {
        taskMessage.textContent = "Please enter a task title.";
        return;
    }

    try {
        await api("/api/tasks", {
            method: "POST",
            body: JSON.stringify({
                title: title,
                priority: taskPriority.value,
                due_date: taskDueDate.value || null
            })
        });

        taskInput.value = "";
        taskPriority.value = "medium";
        taskDueDate.value = "";

        await loadTasks();

        taskInput.focus();
    } catch (error) {
        taskMessage.textContent = error.message;
    }
});

// Fetch today's tasks from SQLite through the backend.
async function loadTasks() {
    const data = await api("/api/tasks");

    tasks = data.tasks;
    renderTasks();
}

// Return today's date as YYYY-MM-DD without locale dependencies.
function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// Display task statistics and the task list.
function renderTasks() {
    taskList.replaceChildren();

    const completed = tasks.filter(task => Boolean(task.completed)).length;
    const remaining = tasks.length - completed;

    const percent = tasks.length
        ? Math.round((completed / tasks.length) * 100)
        : 0;

    document.getElementById("totalTasks").textContent = tasks.length;
    document.getElementById("completedTasks").textContent = completed;
    document.getElementById("remainingTasks").textContent = remaining;
    document.getElementById("progressPercent").textContent = `${percent}%`;
    document.getElementById("progressBar").style.width = `${percent}%`;

    document.getElementById("taskCountLabel").textContent =
        `${tasks.length} task${tasks.length === 1 ? "" : "s"} today`;

    emptyMessage.classList.toggle("hidden", tasks.length > 0);

    for (const task of tasks) {
        const item = document.createElement("li");

        item.className =
            `task-item${task.completed ? " completed" : ""}`;

        // Completion checkbox.
        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.checked = Boolean(task.completed);
        checkbox.setAttribute("aria-label", `Complete ${task.title}`);

        checkbox.addEventListener("change", async () => {
            const previousValue = !checkbox.checked;

            checkbox.disabled = true;
            taskMessage.textContent = "";

            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        completed: checkbox.checked
                    })
                });

                await loadTasks();
            } catch (error) {
                checkbox.checked = previousValue;
                taskMessage.textContent = error.message;
            } finally {
                checkbox.disabled = false;
            }
        });

        // Task title.
        const title = document.createElement("span");

        title.className = "task-title";
        title.textContent = task.title;

        // Priority and due-date details.
        const details = document.createElement("div");
        details.className = "task-details";

        const priority = document.createElement("span");

        const taskPriorityValue =
            ["low", "medium", "high"].includes(task.priority)
                ? task.priority
                : "medium";

        priority.className =
            `priority-badge priority-${taskPriorityValue}`;

        priority.textContent =
            taskPriorityValue.charAt(0).toUpperCase() +
            taskPriorityValue.slice(1);

        const dueDate = document.createElement("span");
        dueDate.className = "due-date";

        if (task.due_date) {
            dueDate.textContent = `Due: ${task.due_date}`;

            if (
                !task.completed &&
                task.due_date < getTodayString()
            ) {
                dueDate.classList.add("overdue");
                dueDate.textContent += " · Overdue";
            }
        } else {
            dueDate.textContent = "No due date";
        }

        details.append(priority, dueDate);

        // Edit button.
        const actions = document.createElement("div");
        actions.className = "task-actions";

        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", async () => {
            const updatedTitle = prompt("Edit task title:", task.title);

            if (updatedTitle === null) return;

            const cleanTitle = updatedTitle.trim();

            if (!cleanTitle || cleanTitle.length > 120) {
                taskMessage.textContent =
                    "Task title must contain 1–120 characters.";
                return;
            }

            const updatedPriority = prompt(
                "Enter priority: low, medium, or high",
                taskPriorityValue
            );

            if (updatedPriority === null) return;

            const cleanPriority = updatedPriority.trim().toLowerCase();

            if (!["low", "medium", "high"].includes(cleanPriority)) {
                taskMessage.textContent =
                    "Priority must be low, medium, or high.";
                return;
            }

            const updatedDueDate = prompt(
                "Enter due date as YYYY-MM-DD, or leave blank for none:",
                task.due_date || ""
            );

            if (updatedDueDate === null) return;

            const cleanDueDate = updatedDueDate.trim();

            if (
                cleanDueDate &&
                !/^\d{4}-\d{2}-\d{2}$/.test(cleanDueDate)
            ) {
                taskMessage.textContent =
                    "Enter the due date in YYYY-MM-DD format.";
                return;
            }

            if (cleanDueDate) {
                const parsedDate = new Date(`${cleanDueDate}T00:00:00Z`);

                if (
                    Number.isNaN(parsedDate.getTime()) ||
                    parsedDate.toISOString().slice(0, 10) !== cleanDueDate
                ) {
                    taskMessage.textContent = "Please enter a valid calendar date.";
                    return;
                }
            }

            taskMessage.textContent = "";
            editButton.disabled = true;

            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        title: cleanTitle,
                        priority: cleanPriority,
                        due_date: cleanDueDate || null
                    })
                });

                await loadTasks();
            } catch (error) {
                taskMessage.textContent = error.message;
            } finally {
                editButton.disabled = false;
            }
        });

        // Delete button.
        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", async () => {
            if (!confirm(`Delete "${task.title}"?`)) return;

            deleteButton.disabled = true;
            taskMessage.textContent = "";

            try {
                await api(`/api/tasks/${task.id}`, {
                    method: "DELETE"
                });

                await loadTasks();
            } catch (error) {
                taskMessage.textContent = error.message;
            } finally {
                deleteButton.disabled = false;
            }
        });

        actions.append(editButton, deleteButton);

        item.append(checkbox, title, details, actions);
        taskList.append(item);
    }
}

// Restore the session when the page loads or refreshes.
async function initializeApp() {
    try {
        const data = await api("/api/me");

        if (data.user) {
            showDashboard(data.user);
            await loadTasks();
        } else {
            showLoggedOut();
        }
    } catch (error) {
        showLoggedOut();
        authMessage.textContent = error.message;
    }
}

initializeApp();


// DAYTRACKER_TASK_HISTORY_HELPER_V1
(() => {
    const historyDateInput = document.getElementById("historyDate");
    const historyButton = document.getElementById("historyButton");
    const historyMessage = document.getElementById("historyMessage");
    const historyEmptyMessage = document.getElementById("historyEmptyMessage");
    const historyTaskList = document.getElementById("historyTaskList");

    if (!historyDateInput || !historyButton || !historyMessage ||
        !historyEmptyMessage || !historyTaskList) {
        console.warn("DayTracker Task History elements were not found.");
        return;
    }

    const localToday = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    historyDateInput.value = localToday();

    async function loadHistoryTasks() {
        const selectedDate = historyDateInput.value;

        historyMessage.textContent = "";
        historyTaskList.replaceChildren();
        historyEmptyMessage.classList.add("hidden");

        if (!selectedDate) {
            historyMessage.textContent = "Please choose a date.";
            return;
        }

        historyButton.disabled = true;
        historyButton.textContent = "Loading...";

        try {
            const response = await fetch(
                `/api/tasks/history?date=${encodeURIComponent(selectedDate)}`
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || "Could not load task history.");
            }

            const tasks = Array.isArray(data.tasks) ? data.tasks : [];

            if (tasks.length === 0) {
                historyEmptyMessage.classList.remove("hidden");
                return;
            }

            for (const task of tasks) {
                const item = document.createElement("li");
                item.className = "history-task-item";

                const title = document.createElement("strong");
                title.className = "history-task-title";
                title.textContent = task.title || "Untitled task";

                const details = document.createElement("span");
                details.className = "history-task-details";

                const priority = task.priority
                    ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1)
                    : "Normal";

                details.textContent =
                    `${task.completed ? "Completed" : "Not completed"} · ${priority} priority`;

                item.append(title, details);
                historyTaskList.appendChild(item);
            }
        } catch (error) {
            historyMessage.textContent =
                error.message || "Something went wrong while loading history.";
        } finally {
            historyButton.disabled = false;
            historyButton.textContent = "View tasks";
        }
    }

    historyButton.addEventListener("click", loadHistoryTasks);
    historyDateInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadHistoryTasks();
        }
    });
})();
