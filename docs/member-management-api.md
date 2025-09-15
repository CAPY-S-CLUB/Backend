# Member Management API Documentation

This document describes the member management endpoints for community administration, including invitation management and member control.

## Overview

The Member Management API provides secure endpoints for:
- Creating and managing community invitations
- Listing and filtering community members
- Removing members from communities

## Authentication

All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### Permission Levels
- **Member**: Can view community members
- **Admin**: Can create invitations and remove members

## Endpoints

### 1. Create Community Invitation

**POST** `/api/communities/{communityId}/invites`

Creates a secure invitation for a new member to join the community.

#### Authentication Required
- **Admin access** to the community

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|--------------|
| communityId | string | MongoDB ObjectId of the community |

#### Request Body
```json
{
  "email": "newmember@example.com",
  "expiration_hours": 24
}
```

#### Request Body Parameters
| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| email | string | Yes | Email address of the invitee | Valid email format |
| expiration_hours | number | No | Hours until invitation expires | 1-168 (default: 24) |

#### Success Response (201)
```json
{
  "success": true,
  "message": "Invitation created successfully",
  "data": {
    "invitation_id": "507f1f77bcf86cd799439011",
    "email": "newmember@example.com",
    "community_id": "507f1f77bcf86cd799439012",
    "expiration_date": "2024-01-15T12:00:00.000Z",
    "status": "pending",
    "created_at": "2024-01-14T12:00:00.000Z"
  }
}
```

#### Error Responses

**400 - Validation Error**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

**401 - Unauthorized**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**403 - Forbidden**
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

**409 - Conflict**
```json
{
  "success": false,
  "message": "An active invitation already exists for this email"
}
```

### 2. List Community Members

**GET** `/api/communities/{communityId}/members`

Retrieves a paginated and filterable list of community members.

#### Authentication Required
- **Member access** to the community

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|--------------|
| communityId | string | MongoDB ObjectId of the community |

#### Query Parameters
| Parameter | Type | Required | Description | Constraints |
|-----------|------|----------|-------------|-------------|
| page | number | No | Page number for pagination | Min: 1 (default: 1) |
| limit | number | No | Number of members per page | 1-100 (default: 20) |
| name | string | No | Filter by first or last name | Case-insensitive partial match |
| email | string | No | Filter by email address | Case-insensitive partial match |
| join_date_from | string | No | Filter members joined after this date | ISO 8601 format |
| join_date_to | string | No | Filter members joined before this date | ISO 8601 format |

#### Example Request
```
GET /api/communities/507f1f77bcf86cd799439012/members?page=1&limit=10&name=John&email=example.com
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Members retrieved successfully",
  "data": {
    "members": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "first_name": "John",
        "last_name": "Doe",
        "email": "john.doe@example.com",
        "role": "member",
        "status": "active",
        "created_at": "2024-01-10T10:30:00.000Z",
        "last_active": "2024-01-14T15:45:00.000Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_count": 47,
      "limit": 10,
      "has_next_page": true,
      "has_prev_page": false
    },
    "filters_applied": {
      "name": "John",
      "email": "example.com"
    }
  }
}
```

#### Error Responses

**400 - Validation Error**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "page",
      "message": "Page must be a positive integer"
    }
  ]
}
```

**401 - Unauthorized**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**403 - Forbidden**
```json
{
  "success": false,
  "message": "Access denied. You don't have permission to view this community's members."
}
```

### 3. Remove Community Member

**DELETE** `/api/communities/{communityId}/members/{memberId}`

Removes a member from the community. Only community administrators can perform this action.

#### Authentication Required
- **Admin access** to the community

#### Path Parameters
| Parameter | Type | Description |
|-----------|------|--------------|
| communityId | string | MongoDB ObjectId of the community |
| memberId | string | MongoDB ObjectId of the member to remove |

#### Success Response (200)
```json
{
  "success": true,
  "message": "Member removed successfully",
  "data": {
    "removed_member": {
      "id": "507f1f77bcf86cd799439013",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "removed_at": "2024-01-14T16:30:00.000Z"
    }
  }
}
```

#### Error Responses

**400 - Validation Error**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "memberId",
      "message": "Invalid member ID format"
    }
  ]
}
```

**401 - Unauthorized**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**403 - Forbidden (Non-Admin)**
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

**403 - Forbidden (Admin Protection)**
```json
{
  "success": false,
  "message": "Cannot remove community administrator"
}
```

**404 - Not Found**
```json
{
  "success": false,
  "message": "Member not found in this community"
}
```

## Data Models

### Invitation Model
```javascript
{
  _id: ObjectId,
  token_hash: String,        // Hashed invitation token
  email: String,             // Invitee email
  community_id: ObjectId,    // Reference to community
  invited_by: ObjectId,      // Reference to admin who created invitation
  expiration_date: Date,     // When invitation expires
  status: String,            // 'pending', 'accepted', 'expired', 'revoked'
  created_at: Date,
  updated_at: Date
}
```

### Member Response Model
```javascript
{
  _id: ObjectId,
  first_name: String,
  last_name: String,
  email: String,
  role: String,              // 'member', 'admin'
  status: String,            // 'active', 'inactive'
  created_at: Date,          // Join date
  last_active: Date
}
```

## Security Features

### Invitation Security
- **Secure Token Generation**: Uses crypto.randomBytes for cryptographically secure tokens
- **Token Hashing**: Only hashed tokens are stored in the database
- **Expiration Control**: Configurable expiration times (1-168 hours)
- **Email Validation**: Strict email format validation
- **Duplicate Prevention**: Prevents multiple active invitations for the same email

### Access Control
- **JWT Authentication**: All endpoints require valid JWT tokens
- **Role-Based Access**: Different permission levels for members and admins
- **Community Membership**: Users can only access communities they belong to
- **Admin Protection**: Prevents removal of community administrators

### Rate Limiting
- Invitation creation is rate-limited to prevent spam
- Member listing includes pagination to prevent large data dumps

## Email Integration

The invitation system integrates with email services to send invitation links:

### Email Configuration
```javascript
// Environment variables required
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=https://your-app.com
```

### Email Template
Invitation emails include:
- Community name and description
- Invitation link with secure token
- Expiration date and time
- Instructions for accepting the invitation

## Error Handling

All endpoints follow consistent error response format:
```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": [  // Optional detailed validation errors
    {
      "field": "field_name",
      "message": "Specific field error"
    }
  ]
}
```

## Testing

Comprehensive test suite available in `/tests/memberManagement.test.js` covering:
- Unit tests for all endpoints
- Integration tests for complete workflows
- Security tests for authentication and authorization
- Performance tests for large datasets
- Edge cases and error scenarios

## Usage Examples

### Creating an Invitation
```bash
curl -X POST \
  http://localhost:3000/api/communities/507f1f77bcf86cd799439012/invites \
  -H 'Authorization: Bearer your-jwt-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "newmember@example.com",
    "expiration_hours": 48
  }'
```

### Listing Members with Filters
```bash
curl -X GET \
  'http://localhost:3000/api/communities/507f1f77bcf86cd799439012/members?page=1&limit=10&name=John&email=example.com' \
  -H 'Authorization: Bearer your-jwt-token'
```

### Removing a Member
```bash
curl -X DELETE \
  http://localhost:3000/api/communities/507f1f77bcf86cd799439012/members/507f1f77bcf86cd799439013 \
  -H 'Authorization: Bearer your-admin-jwt-token'
```

## Best Practices

1. **Always validate input**: Use the provided validation middleware
2. **Handle errors gracefully**: Provide meaningful error messages
3. **Use pagination**: Don't load large datasets without pagination
4. **Secure tokens**: Never expose raw invitation tokens
5. **Monitor invitations**: Regularly clean up expired invitations
6. **Audit member changes**: Log all member additions and removals
7. **Rate limiting**: Implement appropriate rate limits for invitation creation

## Changelog

### Version 1.0.0 (2024-01-14)
- Initial implementation of member management API
- Invitation system with secure token generation
- Member listing with filtering and pagination
- Member removal with admin protection
- Comprehensive test suite
- Email integration for invitations