# Moreh Academy Admission Portal — Rebuild Database Schema

**Status:** Draft baseline aligned to `AP_SCHEMA`  
**Schema version:** `2.0.0`  
**Development branch:** `rebuild/clean-start`  
**Backend:** Google Apps Script + Google Sheets  
**Timezone:** Asia/Manila

> This is a new database. Do not connect the rebuild to the legacy workbook or migrate live personal data until the schema and privacy controls are approved.

## Product boundaries

- Parents/guardians and students have individual portal accounts. Account creation and linking are controlled by server-side workflows.
- One parent account may be linked to multiple student profiles; a student may have multiple authorized guardians.
- Applications are tracked independently by admission cycle/school year.
- Admission requirements are submitted personally at the school. Admissions personnel update receipt and verification in the student's portal profile.
- The portal does not accept requirement-file uploads.
- The portal does not process, record, reconcile, or track payments. Accounting and the School Cashier continue to use the official school system.
- Assessment booking, portal messaging, notifications, staff access, and audit history are in scope for the admission workflow.
- Academic operations (subjects, teacher loads, advisers, COR, career results, scholarships) are outside the initial admission MVP unless a later phase explicitly includes them.

## Canonical spreadsheet structure

The following 17 tabs and header orders must match `AP_SCHEMA` in `AP_Config.gs` exactly. Row 1 contains the headers. Do not rename, reorder, or insert columns without a reviewed schema migration.

### 1. Settings
`SettingKey,SettingValue,Description,IsActive,UpdatedAt,UpdatedByUserID`

Configuration values such as enrollment enablement and the active school year belong here. Never store secrets, API keys, password peppers, raw OTPs, invitation codes, or session tokens in this sheet.

### 2. Users
`UserID,Username,Email,AccountType,PasswordHash,PasswordSalt,Role,AccountStatus,EmailVerifiedAt,MustChangePassword,PasswordChangeRequired,FailedLoginCount,LockedUntil,LastLoginAt,CreatedAt,UpdatedAt`

One row per login identity. `Username` is the login identifier; `Email` is a contact/verification address and must be normalized and checked for uniqueness according to the approved account policy. `AccountType` and `Role` are assigned or validated server-side and never trusted from browser input. Store only versioned salted password records generated server-side. Never store plaintext passwords.

### 3. ParentProfiles
`ParentID,UserID,FirstName,MiddleName,LastName,Suffix,MobileNumber,AlternateMobile,Email,RelationshipToStudent,AddressLine1,AddressLine2,Barangay,City,Province,PostalCode,CreatedAt,UpdatedAt`

Keep guardian identity and contact details separate from student data. A parent profile is linked to a login identity through `UserID`.

### 4. StudentProfiles
`StudentID,UserID,LRN,FirstName,MiddleName,LastName,Suffix,PreferredName,Birthdate,Birthplace,Sex,Nationality,Religion,ReligionOther,MobileNumber,Email,AddressLine1,AddressLine2,Barangay,City,Province,PostalCode,PreviousSchool,PreviousSchoolAddress,PreviousSchoolYear,PreviousGradeLevel,ProfileStatus,CreatedAt,UpdatedAt`

`UserID` may be blank until an authorized student account is provisioned. Avoid duplicating guardian contact fields here.

### 5. ParentStudentLinks
`LinkID,ParentID,StudentID,Relationship,IsPrimaryContact,CanViewApplication,CanReceiveNotifications,ConsentStatus,LinkedAt,LinkedByUserID,UpdatedAt`

Supports multiple children per parent and multiple authorized guardians per student. Every read/write must verify the link and its permissions on the server.

### 6. Applications
`ApplicationID,StudentID,SchoolYear,AdmissionType,ApplyingGradeLevel,ApplyingDepartment,ApplyingCluster,ApplicationStatus,SubmittedAt,ReviewedAt,ReviewedByUserID,Decision,DecisionAt,DecisionByUserID,StaffNotes,CreatedAt,UpdatedAt`

A student may have applications across admission cycles. Application status and decisions belong to the application, not the long-lived student profile.

### 7. AdmissionRequirements
`RequirementID,ApplicationID,StudentID,RequirementType,IsRequired,SubmissionStatus,ReceivedDate,ReceivedByUserID,VerificationStatus,VerifiedByUserID,VerifiedAt,Remarks,CreatedAt,UpdatedAt`

Admissions personnel record physical submission and verification only. Suggested values:
- `SubmissionStatus`: Pending, Received, Not Required
- `VerificationStatus`: Pending, Verified, Rejected

Create requirement rows from the approved checklist for the relevant application. No upload URLs or file IDs.

### 8. AssessmentSlots
`SlotID,SchoolYear,AssessmentType,StartAt,EndAt,Capacity,BookedCount,Location,Instructions,SlotStatus,CreatedAt,UpdatedAt,CreatedByUserID`

Only active slots with remaining capacity may be booked. Capacity and booking operations require server-side validation and concurrency protection.

### 9. AssessmentBookings
`BookingID,ApplicationID,StudentID,SlotID,BookingStatus,BookedAt,BookedByUserID,AttendanceStatus,StaffNotes,UpdatedAt`

Suggested booking statuses: Booked, Rescheduled, Cancelled, Completed, NoShow. Prevent duplicate active bookings for the same application unless an authorized staff action explicitly permits it.

### 10. Messages
`MessageID,ThreadID,ApplicationID,SenderUserID,RecipientUserID,MessageBody,SentAt,ReadAt,MessageStatus`

Use a thread identifier to group conversations. Do not place credentials, OTPs, invitation codes, or payment details in messages.

### 11. Notifications
`NotificationID,UserID,ApplicationID,NotificationType,Title,Body,RelatedRecordID,IsRead,CreatedAt,ReadAt`

Notifications are informational. They are not the authoritative record of application status.

### 12. StaffAccess
`StaffAccessID,UserID,StaffName,Designation,Department,AccessRole,AccessScope,IsActive,GrantedAt,GrantedByUserID,RevokedAt,RevokedByUserID`

Apply least-privilege access. Protected server functions must validate role and scope for every request.

### 13. AuditLogs
`AuditID,ActorUserID,ActorRole,Action,EntityType,EntityID,BeforeValue,AfterValue,IPAddress,UserAgent,CreatedAt`

Application-generated audit history should be append-only. Log authentication/security events and material changes to profiles, applications, requirements, bookings, and staff permissions. Do not log passwords, OTPs, invitation codes, session tokens, verification handles, derived keys, or unnecessary sensitive personal data.

### 14. AuthChallenges
`ChallengeID,Email,Purpose,CodeHash,ExpiresAt,Attempts,MaxAttempts,Status,CreatedAt,LastSentAt,StudentID,SchoolYear`

Stores OTP challenge metadata and HMAC values, never plaintext OTPs. Challenges must be purpose-bound, expire, enforce attempt/resend limits, and be consumed once. `StudentID` and `SchoolYear` are server-side binding context, not browser-authoritative values.

### 15. Sessions
`SessionID,UserID,TokenHash,CreatedAt,ExpiresAt,LastSeenAt,RevokedAt,UserAgent`

Store only a digest of a high-entropy opaque session token. Validate expiry and revocation on every protected request. Never store or return the raw session token in this sheet.

### 16. ParentInvitations
`InvitationID,StudentID,ParentEmail,Relationship,InviteCodeHash,ExpiresAt,Status,CreatedByUserID,CreatedAt,AcceptedAt,AcceptedByUserID`

An invitation is restricted to its named email, student, and relationship. Store only a server-side HMAC of the invitation code. Acceptance must revalidate pending status and expiry and must be one-time.

### 17. ParentLinkRequests
`RequestID,StudentID,StudentUserID,ParentEmail,ParentName,Relationship,Status,SubmittedAt,ReviewedByUserID,ReviewedAt,AdminRemarks`

Student-submitted requests for an existing parent/guardian to be linked. Staff review and approve/reject the request. Approval must verify the student identity, parent identity, and authorization before creating a `ParentStudentLinks` row.

## Authentication and account lifecycle

- Existing students are provisioned by an authorized administrator. Temporary credentials are distributed individually; the student must change the temporary password before ordinary portal access.
- Parent accounts are created through a named, expiring invitation and verification to the invited email. The invitation determines the permitted student and relationship.
- New-student registration is available only while enrollment is explicitly enabled for the exact configured school year. The setting and school year must be rechecked when registration is committed, not only when an OTP is issued.
- Staff accounts are administrator-provisioned. Role and access scope are server-assigned.
- The browser must never choose or override a user's role, account type, student linkage, invitation relationship, application decision, or privileged status.
- Every protected endpoint must validate a server-issued session and authorize the specific record on the server.
- The current authentication implementation is incomplete. These lifecycle descriptions are requirements, not a claim that all workflows are already implemented or production-ready.

## Legacy workbook mapping

| Legacy worksheet / concept | Rebuild destination |
|---|---|
| Students | StudentProfiles + Applications + AdmissionRequirements |
| Users | Users |
| Academic Staff | StaffAccess |
| Student Bio | StudentProfiles (only approved profile fields) |
| Status Log | AuditLogs (plus current status in Applications) |
| Enrollment History | Future phase; not part of initial admission MVP |
| Deleted Students | Future retention/archive policy; do not copy into live tables |
| Flags | Future workflow extension after office ownership and rules are defined |
| Mail Queue | Future email delivery implementation; not a user-facing data table in the MVP |
| Audit | AuditLogs |
| Events / Content | Settings or a later public-content module |
| Fees / Fee Notes | Excluded; the official school payment system remains authoritative |
| Subjects / Teacher Loads / Advisers | Future academic operations module |
| Career Results / COR Settings / Scholarships | Future phase; confirm scope before designing |

## Spreadsheet setup and maintenance rules

1. Create/use the new database spreadsheet; do not connect the rebuild to the legacy workbook.
2. Maintain exactly these 17 tabs and header orders from `AP_SCHEMA`.
3. Freeze row 1 and enable filters on each tab.
4. Store dates as actual date/time values, using Asia/Manila for school operations.
5. Treat IDs as immutable text identifiers generated by the backend; never use row numbers as IDs.
6. Do not add formulas that expose or derive password hashes, access rights, or sensitive personal data.
7. Protect Users, StaffAccess, AuditLogs, AuthChallenges, Sessions, ParentInvitations, and ParentLinkRequests from routine manual editing. Restrict spreadsheet sharing to authorized personnel.
8. Do not import personal data from the legacy workbook at this stage.
9. Add validation lists only after status vocabularies and transitions are finalized.
10. Backend code must validate writes, authorization, required fields, uniqueness, and allowed status transitions.
11. A schema change requires an explicit migration plan, a matching `AP_SCHEMA` update, and a health check. Do not add columns ad hoc.

## Open decisions before production

- Final admission requirement checklist by grade level/admission type.
- Exact application lifecycle statuses and decision labels.
- Whether students must have their own login at initial launch or may be linked later.
- Assessment types, slot duration, capacity, and rescheduling policy.
- Retention periods and who may access sensitive student/guardian fields.
- Whether Flags and email queue functionality are needed in the first release.
- Approved password KDF dependency, salt source, and operational work factor.
- Final deployment access mode and school Google Workspace constraints.
