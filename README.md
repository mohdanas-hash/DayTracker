@'
# DayTracker

DayTracker is a personal productivity web application for managing daily tasks and tracking progress. People can use to track their daily life.

## Features

- User registration and login
- Create and manage tasks
- Mark tasks as completed
- Track daily progress
- View task history by date
- PostgreSQL database using Neon

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js
- Express.js
- PostgreSQL
- Neon

## Getting Started

1. Clone this repository.
2. Install dependencies using `npm install`.
3. Configure your environment variables in a `.env` file.
4. Start the application using the start command configured in `package.json`.

## Security

Never commit your `.env` file, database credentials, or local database files.
'@ | Set-Content -Path README.md -Encoding utf8
