# ChefConnect — Chef Hiring and Availability Booking System

A beginner-friendly college project using React, Vite, Express, Node.js, Mongoose, and MongoDB Atlas.

## Features

- Chef registration with cuisine, experience, price, city, bio, and availability.
- Browse and filter chefs by name, cuisine, city, and hourly price.
- Request a chef for a date/time inside a listed availability window.
- Backend validation prevents bookings outside listed availability and checks overlapping pending/confirmed requests.
- Booking lookup by customer email.
- Chef dashboard to view requests assigned to a chef profile and accept/reject pending requests.
- Demo booking status controls for pending, confirmed, rejected, and cancelled requests.
- Responsive layout for desktop and mobile.

## Requirements

- Node.js 18 or newer
- npm
- A MongoDB Atlas account and database user

## 1. Configure MongoDB Atlas

1. Sign in to MongoDB Atlas and create a free cluster if you do not have one.
2. Open **Database Access** and create a database user with a username and password.
3. Open **Network Access** and allow your current IP address.
4. Open your cluster and click **Connect** → **Drivers**.
5. Copy the Node.js connection string.
6. In the project root, copy `.env.example` to `.env`.
7. Replace the example `MONGODB_URI` with the Atlas connection string. Replace `<db_password>` with the database user's password and keep `/chefconnect` in the URL.

Do not put the connection string in frontend code or commit `.env` to GitHub.

## 2. Install and run

Open a terminal in the project folder:

```bash
npm install
```

Create `.env` from `.env.example`, then edit it with your real MongoDB connection string.

Start the frontend and backend:

```bash
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` for server/database status.

## 3. How to demo

1. Go to **Join as a chef** and register a chef with a future date and time window.
2. Return to **Find a chef** and search for the new chef.
3. Click **Book chef**, enter customer details, and choose a time inside the availability window.
4. Submit. The booking is saved with `pending` status.
5. Open **My bookings**, use the customer email, and see the booking.

## API routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | API and DB status |
| GET | `/api/chefs` | List/search chefs |
| POST | `/api/chefs` | Register a chef |
| POST | `/api/bookings` | Request a booking |
| GET | `/api/bookings?email=...` | Find bookings by customer email |
| PATCH | `/api/bookings/:id/status` | Update demo booking status |

## MongoDB collections

Mongoose creates these collections automatically when data is first inserted:

- `chefs`
- `customers`
- `bookings`

## Important college-project limitation

This is a learning/demo application, not a production booking platform. The chef dashboard currently identifies a chef by registered email and is not protected by authentication; anyone who knows a chef's email could view that chef's requests and update statuses. Do not deploy it with real personal data as-is. A production version needs login, role-based authorization, stronger phone/date validation, rate limiting, privacy controls, and atomic booking conflict protection. This demo checks conflicts in the backend, but simultaneous requests can still race without a transaction/locking strategy.

## Troubleshooting

- **MongoDB connection failed:** verify the URI, username/password, URL-encode special characters in the password, and check Atlas Network Access.
- **No chefs showing:** register a chef with an availability date today or later. Search filters may hide chefs if max price is too low.
- **API error / failed fetch:** run `npm run dev` from the project root and keep both processes running.
- **Port in use:** change `PORT` in `.env` or stop the process using port 5000.



To start the system : 
cd ChefConnect
npm run dev