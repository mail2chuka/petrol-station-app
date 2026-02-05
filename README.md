# Petrol Station Manager App

A comprehensive fuel station management system built with Next.js, MongoDB, and Tailwind CSS.

## Features

### Admin/Owner Features
- Create and manage multiple fuel stations
- Create users (managers, accountants, attendants)
- Adjust fuel prices (PMS and AGO)
- View comprehensive reports across all stations
- Access audit logs for all operations
- Monitor all daily operations in real-time

### Station Manager Features
- Begin and end daily operations
- Assign attendants to dispensers with initial readings
- Receive and record fuel stock
- Record final dispenser readings at end of day
- View station-specific reports
- Manage daily shift operations

### Station Accountant Features
- Record cash and POS payments from attendants
- View payment records
- Track daily collections
- Monitor discrepancies

### Station Attendant Features
- Record sales (liters sold)
- Enter cash and POS payments received
- View personal sales history
- Track daily performance

## Tech Stack

- **Frontend**: Next.js 14, React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: MongoDB with Mongoose
- **Authentication**: NextAuth.js
- **Validation**: Zod

## Database Design

The system uses MongoDB with the following collections:

- **Users**: Stores all user accounts (admin, manager, accountant, attendant)
- **Stations**: Fuel station information, prices, stock levels, and dispensers
- **DayShifts**: Daily operational records with dispenser assignments
- **SalesEntries**: Individual sales transactions
- **PaymentRecords**: Payment collections from attendants
- **StockMovements**: Fuel stock receipts and adjustments
- **PriceHistory**: Historical price changes
- **AuditLogs**: Complete audit trail of all operations

## Key Features

### Transaction Safety
- All financial operations use MongoDB transactions
- Atomic updates for stock and payment records
- Rollback on errors

### Data Validation
- Frontend validation with Zod schemas
- Backend validation for all API endpoints
- Type-safe data handling

### Performance Optimization
- Denormalized data for frequently accessed fields
- Proper indexing on all collections
- Compound indexes for complex queries
- Aggregation pipeline for reports

### Audit Trail
- Complete audit logging for all operations
- Soft deletes (users marked as inactive, never deleted)
- Immutable transaction records

## Setup Instructions

1. **Clone the repository**
   ```bash
   cd petrol-station-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.local.example` to `.env.local`
   - Update the MongoDB connection string
   - Set a secure NEXTAUTH_SECRET

   ```bash
   cp .env.local.example .env.local
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system.

5. **Seed an admin user (optional)**
   ```bash
   node scripts/seed-admin.mjs
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

7. **Open the application**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Default Admin Credentials

After running the seed script:
- **Email**: admin@example.com
- **Password**: admin123

**Important**: Change these credentials immediately in production!

## Project Structure

```
src/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   ├── auth/            # Authentication
│   │   ├── users/           # User management
│   │   ├── stations/        # Station management
│   │   ├── day-shifts/      # Daily operations
│   │   ├── sales/           # Sales entries
│   │   ├── payments/        # Payment records
│   │   ├── reports/         # Reporting endpoints
│   │   └── audit/           # Audit logs
│   ├── admin/               # Admin dashboard
│   ├── manager/             # Manager dashboard
│   ├── accountant/          # Accountant dashboard
│   ├── attendant/           # Attendant dashboard
│   └── login/               # Login page
├── components/              # Reusable React components
├── lib/                     # Utility functions
│   ├── db.js               # Database connection
│   ├── auth.js             # Authentication helpers
│   ├── audit.js            # Audit logging
│   ├── constants.js        # Constants and enums
│   └── validation.js       # Validation schemas
└── models/                  # MongoDB/Mongoose models
    ├── User.js
    ├── Station.js
    ├── DayShift.js
    ├── SalesEntry.js
    ├── PaymentRecord.js
    ├── StockMovement.js
    ├── PriceHistory.js
    └── AuditLog.js
```

## Workflow

### Daily Operations Flow

1. **Manager begins the day**
   - Assigns attendants to dispensers
   - Records initial dispenser readings
   - System captures current fuel prices

2. **Attendants record sales**
   - Enter liters sold
   - Record cash and POS payments

3. **Accountant collects payments**
   - Records actual cash and POS received from attendants

4. **Manager ends the day**
   - Records final dispenser readings
   - System calculates totals and discrepancies
   - Updates station stock levels

5. **Admin views reports**
   - Access comprehensive daily reports
   - View individual attendant performance
   - Monitor discrepancies and audit trail

## API Routes

### Authentication
- `POST /api/auth/[...nextauth]` - Authentication endpoints

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `GET /api/users/[id]` - Get user by ID
- `PATCH /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Deactivate user

### Stations
- `GET /api/stations` - List all stations
- `POST /api/stations` - Create new station
- `POST /api/stations/[id]/prices` - Adjust fuel prices
- `POST /api/stations/[id]/stock` - Receive fuel stock
- `GET /api/stations/[id]/dispensers` - List dispensers
- `POST /api/stations/[id]/dispensers` - Add dispenser

### Daily Operations
- `POST /api/day-shifts/begin` - Begin a new day
- `POST /api/day-shifts/[id]/end` - End the day
- `GET /api/day-shifts` - Get day shifts
- `GET /api/day-shifts/[id]` - Get specific day shift

### Sales & Payments
- `POST /api/sales` - Record sales entry
- `GET /api/sales` - Get sales entries
- `POST /api/payments` - Record payment
- `GET /api/payments` - Get payment records

### Reports & Audit
- `GET /api/reports/daily` - Get daily report
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
