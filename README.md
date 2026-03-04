# Butchery Pro - Management System

A comprehensive desktop Point of Sale (POS) and management system designed specifically for butchery businesses. Built with React, Electron, Node.js/Express, and PostgreSQL.

## Features

- **Dashboard** – Real-time sales metrics, revenue charts, top products, low stock alerts
- **POS** – Product grid with category filters, cart with quantity controls, checkout
- **Item Details** – Full product catalog management (CRUD)
- **GRN (Goods Received Notes)** – Track incoming stock from suppliers
- **SIV (Store Issue Vouchers)** – Track outgoing stock issuances
- **Inventory** – Live stock status with low-stock indicators
- **Cash Receipts** – Record incoming payments
- **Payment Vouchers** – Record outgoing payments
- **Cash Book** – Full ledger with running balance
- **Account Payables** – Supplier invoice tracking and payment status
- **Suppliers** – Supplier contact and account management
- **Customers** – Customer profiles with loyalty points tracking
- **User Management** – Role-based access (Administrator, Manager, Cashier, Staff)
- **Profile Settings** – Personal and business information

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Recharts, react-icons |
| Desktop | Electron 28 |
| Backend | Node.js, Express 4.18 |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |

## Prerequisites

- **Node.js** v18+ and npm
- **PostgreSQL** v14+

## Setup

### 1. Clone and Install

```bash
# Install all dependencies
npm run install:all
# Or install individually
cd backend && npm install
cd ../frontend && npm install
```

### 2. Database Setup

Create a PostgreSQL database and run the schema:

```bash
createdb butchery_pro
psql -d butchery_pro -f database/schema.sql
```

### 3. Configure Environment

Edit `backend/.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=butchery_pro
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
```

### 4. Run the Application

```bash
# Start both backend and frontend (from root)
npm run dev

# Or start individually
cd backend && npm run dev   # API on port 5000
cd frontend && npm start    # React on port 3000
```

### 5. Run as Desktop App (Electron)

```bash
cd frontend
npm run electron:dev
```

### Default Login

- **Email:** admin@butcherypro.com
- **Password:** admin123

## Project Structure

```
Butchery-POS/
├── package.json              # Root scripts (concurrently)
├── database/
│   └── schema.sql            # PostgreSQL schema + seed data
├── backend/
│   ├── server.js             # Express entry point
│   ├── config/database.js    # PostgreSQL pool configuration
│   ├── middleware/auth.js    # JWT authentication middleware
│   └── routes/               # 14 API route modules
│       ├── auth.js
│       ├── products.js
│       ├── categories.js
│       ├── orders.js
│       ├── grn.js
│       ├── siv.js
│       ├── cashReceipts.js
│       ├── paymentVouchers.js
│       ├── cashBook.js
│       ├── accountPayables.js
│       ├── suppliers.js
│       ├── customers.js
│       ├── users.js
│       ├── dashboard.js
│       └── settings.js
└── frontend/
    ├── electron/main.js      # Electron window configuration
    ├── public/index.html
    └── src/
        ├── index.js           # React entry
        ├── index.css          # Global theme (red #dc2626)
        ├── App.js             # Router + routes
        ├── services/api.js    # Axios API client
        ├── context/AuthContext.js
        ├── components/Layout.js  # Sidebar + header layout
        └── pages/             # 16 page components
            ├── Login.js
            ├── Dashboard.js
            ├── POS.js
            ├── ItemDetails.js
            ├── GRN.js
            ├── SIV.js
            ├── Inventory.js
            ├── CashReceipt.js
            ├── PaymentVoucher.js
            ├── CashBook.js
            ├── AccountPayables.js
            ├── Suppliers.js
            ├── Customers.js
            ├── Profile.js
            └── Users.js
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | User login |
| POST | /api/auth/register | Register user |
| GET/POST | /api/products | List / Create products |
| GET/POST | /api/categories | List / Create categories |
| POST | /api/orders | Create POS order |
| GET/POST | /api/grn | GRN management |
| GET/POST | /api/siv | SIV management |
| GET/POST | /api/cash-receipts | Cash receipts |
| GET/POST | /api/payment-vouchers | Payment vouchers |
| GET/POST | /api/cash-book | Cash book entries |
| GET/POST | /api/account-payables | Account payables |
| GET/POST | /api/suppliers | Supplier management |
| GET/POST | /api/customers | Customer management |
| GET/PUT/DELETE | /api/users | User management |
| GET | /api/dashboard | Dashboard analytics |
| GET/PUT | /api/settings | App settings |

## License

Private – All rights reserved.
