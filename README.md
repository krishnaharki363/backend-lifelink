# LifeLink Backend

LifeLink is a blood donation and emergency blood-request platform for donors, hospitals, blood banks, and administrators. This repository provides its versioned REST API and persistence layer.

## Core capabilities

- donor, hospital, and blood-bank registration with JWT authentication;
- administrator approval for hospital and blood-bank accounts;
- blood-request creation and lifecycle management;
- atomic inventory reservation, release, and fulfillment;
- compatible donor discovery and donor-based request matching;
- donation appointment scheduling and status transitions;
- persistent in-app notifications;
- administrator metrics, activity, and inventory views;
- health checks and Swagger API documentation.

## Technology

- Node.js 20, Express 4, and TypeScript
- Prisma ORM and PostgreSQL
- Zod request and environment validation
- Jest and Supertest integration tests
- Docker Compose for the isolated test database

## Architecture

Requests pass through Express security and request middleware, versioned routers, controllers, and domain services before reaching PostgreSQL through Prisma.

The editable draw.io diagram for the blood-request matching workflow is available at [`docs/lifelink-component-diagram.drawio`](docs/lifelink-component-diagram.drawio).

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL, or Docker for the included local development setup

## Local setup

```bash
git clone git@github.com:krishnaharki363/backend-lifelink.git
cd backend-lifelink
npm install
cp .env.example .env
```

Fill in `.env`, then generate the Prisma client, apply the committed migrations, and start the API:

```bash
npm run prisma:generate
npm run prisma:migrate:prod
npm run dev
```

The API listens at `http://localhost:5000` by default. Swagger UI is available at `http://localhost:5000/api-docs`.

Real environment files are ignored. Commit only `.env.example` and `.env.test.example`, which contain placeholder/local-only values.

## Environment variables

| Group | Variables |
| --- | --- |
| Server | `NODE_ENV`, `PORT`, `API_VERSION` |
| Database | `DATABASE_URL`, optional `DIRECT_URL` |
| Authentication | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, token expiry values |
| Administrator bootstrap | Optional `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the one-time seed command |
| Browser access | `ALLOWED_ORIGINS` |
| Rate limiting | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` |
| Mail configuration | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Security and logging | `BCRYPT_SALT_ROUNDS`, `LOG_LEVEL` |

See `.env.example` for the complete template. SMTP configuration is validated at startup, although outbound email delivery is not currently implemented.

## API groups

All application endpoints are under `/api/v1`.

| Prefix | Responsibility |
| --- | --- |
| `/auth` | Registration, login, refresh, and logout |
| `/donors` | Donor profile and compatible donor search |
| `/blood-banks` | Approved blood-bank directory |
| `/blood-requests` | Request creation, matching, and status transitions |
| `/inventory` | Blood-bank stock and reservation-aware availability |
| `/appointments` | Donation appointment workflow |
| `/notifications` | User notifications and read state |
| `/admin` | Metrics, activity, inventory, and organization verification |
| `/health` | Process and database health |

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with TypeScript hot reload |
| `npm run build` | Compile TypeScript and resolve path aliases |
| `npm start` | Run the compiled server |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check Prettier formatting |
| `npm run test:integration` | Run integration tests with an isolated PostgreSQL container |
| `npm run prisma:migrate:prod` | Apply committed Prisma migrations |
| `npm run admin:seed` | Create the administrator configured in `.env` once |
| `npm run docker:dev` | Start the development Docker Compose stack |

## Integration tests

Docker must be running. The test script refuses to use any database except the dedicated local database on port `5433`.

```bash
cp .env.test.example .env.test
npm run test:integration
```

The script starts PostgreSQL 16, applies migrations, runs the Jest suite, and stops the test stack.

## Administrator bootstrap

The login endpoint never creates accounts. To create the initial administrator, set a unique `ADMIN_EMAIL` and a random `ADMIN_PASSWORD` of at least 16 characters in the target environment, then run:

```bash
npm run admin:seed
```

The command is idempotent and never prints the password. Remove the bootstrap variables from the environment after the administrator has been created.

## Deployment

`render.yaml` contains the Render service definition. Configure all secrets in the Render dashboard; never place production credentials in the repository. The service applies committed migrations before starting the compiled API.

The companion web application is in the [LifeLink frontend repository](https://github.com/krishnaharki363/Lifelink-frontend).

Pull requests and pushes to `main` run build, lint, and integration checks through GitHub Actions.
