# Petrol Station Manager App

Petrol Station Manager App is a role-based fuel station operations system built with Next.js, MongoDB, and Tailwind CSS. It is designed to help a station team run daily fuel operations from a single dashboard-driven interface, with permissions and workflows tailored to each role.

## Overview

The app covers the full fuel-station workflow: setting up stations, managing users, starting and ending daily shifts, assigning attendants to dispensers, recording fuel sales, collecting payments, tracking stock movements, and reviewing reports and audit logs. Admin users can move between stations and manage network-wide settings, while station staff work inside their assigned station context.

## Roles

### Admin
- Create and manage stations
- Create and manage users
- Update fuel prices
- Review station-wide reports
- View audit logs and operational history
- Switch between stations through the admin dashboard

### Manager
- Begin and end the day
- Assign attendants to dispensers
- Record dispenser readings
- Receive and track fuel stock
- Monitor active shifts and station status
- View station-level reports

### Accountant
- Record cash and POS collections from attendants
- Review payment history
- Track daily receipts
- Monitor collection discrepancies

### Attendant
- Record fuel sales in liters
- Capture cash and POS payments received
- Review personal sales history
- Track daily performance against assignment

### Auditor
- Review station reports
- Compare expected and actual totals
- Leave audit comments for review

## Key Features

- Multi-role authentication with NextAuth
- Fuel-specific MongoDB connection and models
- Daily shift tracking with dispenser assignments
- Station stock and price management
- Sales and payment recording
- Daily and summary reporting
- Audit trail for sensitive actions
- Mobile-friendly dashboards for each role

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: MongoDB with Mongoose
- **Authentication**: NextAuth.js
- **Validation**: Zod

## Core Data Model

- **Users**: Accounts for admins, managers, accountants, attendants, and auditors
- **Stations**: Fuel station details, prices, stock levels, and dispensers
- **DayShifts**: Daily station operations and dispenser assignments
- **SalesEntries**: Fuel sales recorded by attendants
- **PaymentRecords**: Cash and POS collections
- **StockMovements**: Fuel receipts and adjustments
- **PriceHistory**: Historical fuel price changes
- **AuditLogs**: Immutable audit trail of system activity

## Workflow

1. The admin creates stations and users, then sets up the operating structure.
2. The manager begins the day, assigns attendants to dispensers, and records initial readings.
3. Attendants record fuel sales and the payments they receive during the shift.
4. The accountant records the cash and POS actually collected from attendants.
5. The manager ends the day, captures final readings, and the system calculates totals and discrepancies.
6. The admin and auditor review reports, history, and audit logs.

## Setup

1. Install dependencies.
   ```bash
   npm install
   ```

2. Configure environment variables in `.env.local`.
   - Set `MONGODB_URI` for the fuel database
   - Set `NEXTAUTH_SECRET`
   - Set `NEXTAUTH_URL`

3. Start MongoDB.

4. Seed an admin user if needed.
   ```bash
   npm run seed
   ```

5. Start the development server.
   ```bash
   npm run dev
   ```

6. Open the app at [http://localhost:3000](http://localhost:3000)

## Default Admin Credentials

After seeding:
- **Email**: admin@example.com
- **Password**: admin123

Change these credentials before production use.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── stations/
│   │   ├── day-shifts/
│   │   ├── sales/
│   │   ├── payments/
│   │   ├── reports/
│   │   └── audit/
│   ├── admin/
│   ├── manager/
│   ├── accountant/
│   ├── attendant/
│   ├── auditor/
│   └── login/
├── components/
├── lib/
│   ├── db-fuel.js
│   ├── auth.js
│   ├── audit.js
│   ├── constants.js
│   └── validation.js
└── models/
    ├── User.js
    ├── Station.js
    ├── DayShift.js
    ├── SalesEntry.js
    ├── PaymentRecord.js
    ├── StockMovement.js
    ├── PriceHistory.js
    └── AuditLog.js
```
- `GET /api/reports/summary` - Get summary report
- `GET /api/audit` - Get audit logs

## Security Features

- Password hashing with bcrypt
- JWT-based authentication
- Role-based access control
- Session management
- Protected API routes
- Input validation and sanitization

## MongoDB Best Practices Implemented

✅ **Transactions for financial operations**
✅ **Data validation on both frontend and backend**
✅ **Proper indexing for performance**
✅ **Denormalized commonly accessed data**
✅ **Aggregation pipeline for complex reports**
✅ **Audit trails - soft deletes only**

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
