# Product Requirements Document
# WhatsApp Reply-Only API

> 🏗️ **Architecture:** [DESIGN.md](./DESIGN.md) | 🔧 **Implementation:** [IMPLEMENTATION.md](./IMPLEMENTATION.md) | 📖 **API Reference:** [API.md](./API.md)

**Version:** 2.0.0
**Status:** ✅ In Production
**Last Updated:** December 12, 2025

---

## Overview

Self-hosted WhatsApp messaging platform for internal team to receive and reply to customer messages.

**Business Value:**
- ✅ Zero recurring API fees (self-hosted solution)
- ✅ Complete data ownership and privacy
- ✅ Compliant with WhatsApp Terms of Service (reply-only)
- ✅ Reduce manual effort through automation

---

## Target Users

| User Type | Role | Primary Need |
|-----------|------|--------------|
| **Team Members** | Customer support, sales | Reply to customer messages quickly |
| **Automation Engineers** | IT/DevOps | Automate responses and integrate with existing systems |
| **System Administrators** | IT operations | Maintain system availability |

**Scale:** 5-10 users handling ~1,000 messages per day

---

## Core Use Cases

1. **Automated Responses** - System automatically replies to common questions
2. **Connection Management** - Admin maintains WhatsApp connection

---

## Features

### User-Facing Features

**Message Management:**
- View incoming WhatsApp messages in web dashboard
- Reply to messages (text only)
- Mark messages as read, replied, or ignored
- Search and filter messages by content, phone number, date
- View message history

**Automation:**
- Receive real-time notifications when messages arrive (webhooks)
- Integrate with external systems via REST API
- Automate responses based on message content
- Bulk update message statuses

**Administration:**
- Authenticate WhatsApp via QR code scan
- Monitor connection status
- View activity logs
- Regenerate API access keys

---

## Success Metrics

**Operational Goals:**
- 95% of messages replied within 30 minutes
- 99% system availability during business hours
- Less than 1% error rate

**Business Goals:**
- 100% team adoption (all members use the system)
- 30% reduction in manual message handling time
- 50% of common queries handled automatically
- Zero WhatsApp Business API subscription fees

---

## User Requirements

### Must Have
- Receive all incoming WhatsApp messages
- Send text replies to customers
- Web dashboard for team members
- API for automation systems
- QR code authentication for WhatsApp

### Should Have
- Real-time webhook notifications
- Message search and filtering
- Activity audit logs
- Support for media files (images, videos, documents)
- Bulk operations for efficiency

### Won't Have
- Send media in replies (text only)
- Initiate new conversations (reply-only)
- Bulk/broadcast messaging
- Message scheduling
- AI/chatbot features

---

## Constraints

**Business Constraints:**
- Must comply with WhatsApp Terms of Service
- Reply-only workflow (cannot send unsolicited messages)
- Internal use only (not customer-facing)

**Operational Constraints:**
- Self-hosted infrastructure required
- Single instance deployment
- Business hours operation (9 AM - 6 PM)

---

## Out of Scope

The following are explicitly **NOT** part of this product:

- ❌ Sending media files in replies
- ❌ Initiating conversations with customers
- ❌ Bulk or broadcast messaging
- ❌ Message scheduling for future delivery
- ❌ Multi-user role management
- ❌ AI or chatbot integration
- ❌ Multi-channel support (Telegram, SMS, etc.)

**Rationale:** Maintain simplicity, ensure compliance, and avoid over-engineering

---

## Assumptions

- Team members are comfortable using web-based tools
- Average message volume: 100-200 per day
- Most messages are text-based
- Messages are primarily in English
- Business hours support is sufficient

---

## Related Documentation

**For Technical Details:**
- **[DESIGN.md](./DESIGN.md)** - Architecture and design decisions
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)** - Implementation details and code examples
- **[API.md](./API.md)** - REST API usage guide

**For Other Information:**
- **[README.md](./README.md)** - Getting started guide
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history
- **[CLAUDE.md](./CLAUDE.md)** - Developer quick reference

---

**Document Owner:** Product Management
**Next Review:** June 12, 2026
