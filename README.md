# Easy Warehouse API

Node.js + Express + TypeScript + Swagger REST API backend for Easy Warehouse System, matching the architecture and standards of Easy Park API (`easypark-api`).

## Features
- **Express + TypeScript** ES Modules
- **Swagger Documentation**: Interactive OpenAPI 3.0 docs generated via `swagger-autogen` served at `/api-docs`
- **Security**: Helmet, CORS, JWT authentication
- **Warehouse Endpoints**:
  - `/api/v1/auth`: Login, Token Refresh, User Profile
  - `/api/v1/warehouses`: Facilities, storage zones, and locations
  - `/api/v1/products`: Product catalog, SKU and barcodes
  - `/api/v1/inventory`: Live stock tracking, on-hand, reserved, available
  - `/api/v1/inbound`: Goods receipts (GRN)
  - `/api/v1/outbound`: Customer dispatch orders (DO)

## Quick Start

### 1. Install Dependencies
```bash
cd D:\warehouse\easy-warehouse-api
npm install
# or
yarn
```

### 2. Generate Swagger Documentation
```bash
npm run swagger
```

### 3. Run Development Server
```bash
npm run dev
```

Visit Swagger Docs: **http://localhost:3000/api-docs**