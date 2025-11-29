# DWCSJ Inventory Management System

## Overview

This is an inventory management system for Divine Word College of San Jose (DWCSJ). The application enables administrators and employees to manage inventory items, process permission requests, generate reports, and communicate via real-time chat. The system features role-based access control, two-factor authentication, and real-time notifications.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build Tool**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Client-side routing handled within a single-page application architecture using manual route management

**State Management**
- TanStack Query (React Query) for server state management, caching, and data synchronization
- React hooks (useState, useEffect) for local component state
- Session-based authentication state stored on the server, retrieved via API calls

**UI Component System**
- Shadcn UI components built on Radix UI primitives for accessible, customizable interface elements
- Tailwind CSS for utility-first styling with a custom design system
- Dark theme as the primary interface (configurable via CSS variables)
- Custom color palette: Raisin Black (#1e212b), Forest Green (#4d8b31), Mikado Yellow (#ffc800), Orange (#ff8427)

**Design Philosophy**
- Utility-focused minimalist design optimized for accessibility
- Generous spacing (Tailwind scale: 4, 6, 8, 12, 16, 24)
- Rounded corners (rounded-2xl, rounded-xl) for softer visual hierarchy
- Fixed sidebar (256px width) with collapsible mobile menu

### Backend Architecture

**Server Framework**
- Express.js running on Node.js with TypeScript
- Session-based authentication using express-session with PostgreSQL session store (connect-pg-simple)
- RESTful API design pattern for all client-server communication

**Authentication & Authorization**
- Bcrypt for password hashing
- Two-factor authentication via email-based verification codes with time-based expiry
- Role-based access control (admin vs. employee roles)
- Session middleware validates authentication and role permissions on protected routes

**Real-time Communication**
- Socket.IO for bidirectional real-time communication
- User-specific socket rooms for targeted notifications and chat messages
- Event-driven architecture for instant updates on inventory changes, request approvals, and chat

**API Structure**
- Centralized route registration in `server/routes.ts`
- Middleware-based authentication (`requireAuth`, `requireRole`) for route protection
- Storage abstraction layer (`server/storage.ts`) decouples business logic from database operations
- Zod schemas for request validation ensure type-safe API contracts

### Data Storage

**Database**
- PostgreSQL as the primary relational database
- Neon serverless PostgreSQL for cloud-hosted database instances
- Drizzle ORM for type-safe database queries and migrations

**Schema Design**
- **Users**: Stores user credentials, roles (admin/employee), and 2FA tokens
- **Categories**: Hierarchical inventory categorization
- **Inventory Items**: Product records with quantity tracking, low stock thresholds, and category relationships
- **Permission Requests**: Employee requests for inventory modifications with approval workflow
- **Notifications**: User-targeted system notifications with read/unread status
- **Chat Messages**: Real-time messaging between users with sender/receiver tracking
- **Reports**: Generated inventory reports with metadata and employee access controls

**Database Relationships**
- Foreign key constraints link inventory items to categories (nullable for uncategorized items)
- Permission requests reference both inventory items and users (employee and reviewer)
- Notifications and chat messages reference users for targeted delivery

**Migration Strategy**
- Drizzle Kit handles schema migrations with SQL generation
- Migration files stored in `/migrations` directory
- Schema definitions centralized in `shared/schema.ts` for client-server type sharing

### External Dependencies

**Database Services**
- Neon serverless PostgreSQL (@neondatabase/serverless)
- PostgreSQL node driver (pg) for connection pooling

**Authentication & Security**
- Bcrypt for password hashing
- Express-session for server-side session management
- Connect-pg-simple for PostgreSQL-backed session storage

**Real-time Communication**
- Socket.IO server and client libraries

**UI Component Libraries**
- Radix UI primitives (@radix-ui/react-*) for 20+ accessible component primitives
- Recharts for data visualization (inventory charts)
- Lucide React for icon system
- Input-otp for two-factor authentication input

**Form Management & Validation**
- React Hook Form for form state management
- Zod for runtime schema validation
- @hookform/resolvers for Zod-React Hook Form integration

**Styling & Utilities**
- Tailwind CSS for utility-first styling
- class-variance-authority for component variant management
- clsx and tailwind-merge for conditional class composition

**Development Tools**
- TypeScript for type safety across frontend and backend
- tsx for running TypeScript files in development
- esbuild for fast production builds
- Replit-specific plugins for development banner and error overlay