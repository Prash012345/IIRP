# Incident Investigation & Recovery Platform

## Setup Instructions
1. Ensure Docker and Docker Compose are installed.
2. Run `docker compose up -d` in the root directory.
3. Once containers are running, navigate to the `Backend` directory and run:
   - `npm run seed` (This applies the schema and seeds the sample data)
4. Access the frontend at `http://localhost:8080` (if using Docker) or `http://localhost:5173` (if running locally via `npm run dev`).
5. **Test Logins:** 
   - Admin     : `admin@incident.io` / `password123`
   - Engineer 1: `juan@incident.io` / `password123`
   - Engineer 2: `kevin@incident.io` / `password123`

## Technical Notes (Smart Requirements & Logic)

**1. Deployment Correlation & Dependency Impact**
- **Correlation:** Calculated dynamically when viewing an incident. The system queries deployments on the affected service within `CORRELATION_WINDOW_MINUTES` (default 60m) prior to the incident creation timestamp. It is explicitly labeled as an "Unverified Root Cause" to prevent false assumptions.
- **Dependency Impact:** Uses a Breadth-First Search (BFS) graph traversal. Nodes 1-hop away are classified as "Directly Affected", while nodes 2+ hops away are "Potentially Affected". Circular dependencies are prevented upon creation using a Depth-First Search (DFS) cycle check.

**2. Redis and Real-Time Updates**
- **Presence:** When users open an incident, they join a Socket.io room. Their presence is tracked in a Redis Hash (`incident:presence:<id>`) to show active investigators.
- **Updates:** All timeline comments, status changes, and assignments are broadcasted via Socket.io to the specific incident room, allowing seamless real-time collaboration without page refreshes.

**3. Duplicate Events and Concurrency**
- **Idempotency:** API requests to add timeline events accept an `idempotencyKey`. A Redis lock (`SET NX`) ensures that duplicate network requests or double-clicks do not create duplicate database entries. 
- **Concurrency:** Incident updates (e.g., status changes) use MySQL row-level locking (`SELECT ... FOR UPDATE`) within transactions to maintain consistent state during concurrent edits.

**4. Troubleshooting & Server Operations**
- **Database/Redis Issues:** If a connection fails, the `/api/health` endpoint flags it. The Node backend uses graceful shutdown handlers (`SIGTERM`/`SIGINT`) to clean sever pool connections.
- **Container Crashes:** Docker Compose is configured with `restart: unless-stopped`. Application errors emit structured logs (JSON) to standard out, preventing silent failures.