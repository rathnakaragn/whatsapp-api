# Changelog

All notable changes to the WhatsApp Reply-Only API project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2025-12-11

### Added
- **Astro SSR Dashboard** - Complete rewrite of dashboard using Astro 5.16.5
  - Server-side rendering for better performance
  - Minimal client-side JavaScript
  - Tailwind CSS 3.4.19 for styling
  - Direct database access (no API layer)
- **Webhook System** - Real-time event notifications
  - Support for 4 events: `message.received`, `message.sent`, `connection.connected`, `connection.disconnected`
  - HMAC-SHA256 signature verification
  - Retry logic with exponential backoff (1s, 2s, 4s)
  - Dashboard interface for webhook CRUD operations
  - 10-second timeout per delivery attempt
- **Audit Logging** - Complete activity tracking
  - SQLite-backed audit log table
  - Tracks all API requests and dashboard actions
  - Captures action, details (JSON), IP address, timestamp
  - Dashboard viewer at `/audit-logs`
- **Batch Operations** - Bulk status updates
  - `PATCH /api/v1/messages/batch/status` endpoint
  - Update multiple message statuses in single request
  - Useful for automation workflows
- **Advanced Filtering** - Enhanced message search
  - Filter by status (unread, read, replied, ignored, sent, all)
  - Search by message content (partial text match)
  - Filter by phone number (partial match)
  - Filter by date range (startDate, endDate)
  - Combine multiple filters in single query
- **Media File Handling** - Full media support
  - Download and store images (JPG, PNG, WebP)
  - Download and store videos (MP4, MKV)
  - Download and store documents (PDF, DOCX, XLSX, etc.)
  - Support for stickers (WebP format)
  - Extract location data (coordinates)
  - Extract contact cards (vCard format)
  - Media files served at `/media/:filename` with auth protection
  - UUID-based filenames to prevent collisions
- **Rate Limiting** - API protection
  - 100 requests per minute per API key
  - Custom headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - 429 status with `Retry-After` header
  - Sliding window algorithm
  - Periodic cleanup to prevent memory leaks
- **API Key Management** - Security enhancements
  - Auto-generated 32-byte random keys (256-bit entropy)
  - API key regeneration via dashboard (`/settings`)
  - Stored in database (not environment variables)
  - Timing-safe comparison for authentication
- **Documentation** - Comprehensive docs
  - PRD.md - Product Requirements Document (151 lines, business-focused)
  - DESIGN.md - Technical architecture (306 lines, high-level design decisions)
  - IMPLEMENTATION.md - Implementation details (980 lines, code examples and schemas)
  - API.md - REST API reference (830 lines)
  - CLAUDE.md - Quick reference guide (325 lines)
  - CHANGELOG.md - Version history (272 lines)
  - Cross-references between all documents

### Changed
- **Dashboard Framework** - Migrated from React to Astro SSR
  - Better performance (no client-side hydration)
  - Simpler architecture (form-based interactions)
  - Smaller bundle size
  - SEO-friendly (not relevant but beneficial)
- **Database Access Pattern** - Dashboard now queries SQLite directly
  - Removed API layer for dashboard pages
  - Faster response times
  - Simpler error handling
- **State Management** - Improved shared state
  - State exposed via `globalThis.__whatsapp_api`
  - Cleaner integration between Express and Astro
  - Better separation of concerns
- **Authentication** - Dual auth system
  - API routes: X-API-Key header (programmatic access)
  - Dashboard routes: HTTP Basic Auth (human access)
  - Separate auth flows for different use cases
- **Pagination** - Enhanced with metadata
  - Response includes `pagination` object with `page`, `limit`, `total`, `totalPages`
  - Max page size limited to 100 items
  - Better UX for large message volumes
- **Docker Configuration** - Production-ready deployment
  - Multi-stage build (builder + production)
  - Node 20 Alpine base image
  - Health check with curl
  - Resource limits (512MB RAM, 0.5 CPU)
  - Proper volume mounting for persistence

### Fixed
- **Session Persistence** - WhatsApp session now survives restarts
  - Session files properly stored in volume/directory
  - Auto-reconnect on server restart (if session valid)
  - Reduced QR code re-authentication frequency
- **Memory Leaks** - Webhook queue cleanup
  - Periodic cleanup of completed webhook jobs
  - Rate limiter map cleanup every 60 seconds
  - Better memory management overall
- **Database Locking** - WAL mode enabled
  - Concurrent reads during writes
  - Reduced "database is locked" errors
  - Better multi-user support
- **Media Download Errors** - Improved error handling
  - Graceful fallback when media unavailable
  - Proper error logging
  - Continue processing even if media fails
- **Astro Build Errors** - Build process now reliable
  - Proper dependency installation in Docker
  - Build artifacts correctly copied to production image
  - Dashboard loads consistently on startup

### Security
- **HMAC Webhook Signatures** - Prevent webhook spoofing
  - HMAC-SHA256 signature in `X-Webhook-Signature` header
  - Configurable secret per webhook
  - Example verification code in API.md
- **Timing-Safe Comparison** - Prevent timing attacks
  - Use `crypto.timingSafeEqual()` for API key comparison
  - Use timing-safe comparison for Basic Auth
  - Mitigates timing-based attacks
- **Prepared Statements** - SQL injection protection
  - All database queries use parameterized statements
  - No string concatenation in SQL
  - Safe from SQL injection attacks
- **Audit Trail** - Security monitoring
  - All API requests logged with IP address
  - Dashboard actions tracked
  - Enables security incident investigation

### Deprecated
- **Environment Variable API Keys** - Now database-only
  - `API_KEY` env var only used for initial setup
  - After first run, API key stored in database
  - Regeneration via dashboard, not env vars

---

## [1.0.0] - 2024-XX-XX

### Added
- **Initial Release** - WhatsApp Reply-Only API
  - Baileys 7.0.0-rc.9 integration
  - Express.js 4.18.2 REST API server
  - SQLite database with better-sqlite3
  - QR code authentication for WhatsApp Web
  - Message reception and storage
  - Reply capability (text only)
  - Message status management (unread, read, replied, ignored, sent)
  - Basic web dashboard (React-based)
  - REST API v1 endpoints:
    - `GET /api/v1/health` - Health check
    - `GET /api/v1/status` - Connection status
    - `GET /api/v1/inbox/:status?` - Get messages
    - `POST /api/v1/messages/:id/reply` - Send reply
    - `PATCH /api/v1/messages/:id/status` - Update status
  - API key authentication
  - Auto-reconnect on WhatsApp disconnection
  - Pino structured logging
  - Docker support
  - PM2 process management support
- **Testing** - Jest test suite
  - 87 tests across 4 test suites
  - Database operations tests (20+ tests)
  - Authentication tests (15+ tests)
  - API endpoint tests (20+ tests)
  - WhatsApp connection tests (19+ tests)
  - Baileys library mocked for isolated testing
  - Coverage reporting with Jest
- **Database Schema** - SQLite tables
  - `messages` - Message storage
  - `api_keys` - API key management
  - `settings` - Configuration storage
  - Indexes on hot paths (status, phone, created_at)

### Security
- **API Key Authentication** - Basic security
  - X-API-Key header support
  - Base64-encoded random keys
  - Environment variable configuration

---

## Version History Summary

| Version | Date | Type | Key Changes |
|---------|------|------|-------------|
| 2.0.0 | 2025-12-11 | Major | Astro dashboard, webhooks, audit logs, media handling |
| 1.0.0 | 2024-XX-XX | Major | Initial release with basic reply-only functionality |

---

## Upgrade Guide

### Upgrading from 1.0.0 to 2.0.0

**Breaking Changes:**
- Dashboard is now Astro SSR (not React)
  - Old dashboard URLs no longer work
  - New dashboard routes: `/`, `/status`, `/login`, `/webhooks`, `/settings`, `/audit-logs`
- API endpoints remain backward compatible (no breaking changes)

**Database Migration:**
- New tables added: `webhooks`, `audit_logs`
- No changes to existing `messages`, `api_keys`, `settings` tables
- Migration runs automatically on first startup

**Configuration Changes:**
- New environment variable: `MEDIA_PATH` (default: `./media`)
- API key now stored in database (regenerate via dashboard if needed)

**Steps:**
1. Backup your database: `cp messages.db messages.db.backup`
2. Pull new Docker image or update code
3. Rebuild Astro dashboard: `cd dashboard && npm run build`
4. Restart application
5. Visit dashboard and verify connection
6. Check audit logs to ensure migration succeeded

---

## Release Notes

### What's New in 2.0.0?

**For End Users:**
- ✨ Beautiful new dashboard with better performance
- 🔔 Real-time webhook notifications for automation
- 📊 Audit logs to track all system activity
- 🔍 Advanced search and filtering
- 📎 Full media support (images, videos, documents)
- ⚡ Faster page loads with Astro SSR

**For Developers:**
- 🎯 Batch status update API for bulk operations
- 🔐 HMAC webhook signatures for security
- 📈 Rate limiting with proper headers
- 🛠️ Comprehensive documentation (PRD, DESIGN, API docs)
- 🧪 No breaking API changes (fully backward compatible)

**For Administrators:**
- 🐳 Production-ready Docker configuration
- 📝 Audit logging for compliance
- 🔑 API key regeneration via dashboard
- 🔄 Auto-reconnect improvements
- 💾 Better session persistence

---

## Related Documentation

- **[PRD.md](./PRD.md)** - Business requirements and product features
- **[DESIGN.md](./DESIGN.md)** - Architecture and design decisions
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Implementation details and code examples
- **[API.md](./API.md)** - REST API usage guide
- **[README.md](./README.md)** - Getting started guide
- **[CLAUDE.md](./CLAUDE.md)** - Developer quick reference

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to this project.

---

## Support

For questions or issues:
- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common problems
- Review the documentation above for specific topics
- Open an issue on GitHub (if applicable)
- Contact the system administrator

---

**Maintained by:** Product & Engineering Team
**Last Updated:** December 12, 2025
