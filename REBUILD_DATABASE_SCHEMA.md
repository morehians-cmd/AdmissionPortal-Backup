# Moreh Academy Admission Portal — Rebuild Database Schema

**Status:** Draft baseline for review  
**Development branch:** `rebuild/clean-start`  
**Backend target:** Google Apps Script + Google Sheets  
**Rule:** This is a new database. Do not connect the rebuild to the legacy workbook or migrate live personal data until the schema and privacy controls are approved.

## Product boundaries

- Parents/guardians and students have individual portal accounts.
- One parent account may be linked to multiple student profiles.
- Applications are tracked independently by admission cycle/school year.
- Requirements are submitted physically at the school. Staff record receipt and verification in the portal.
- The portal does not accept requirement-file uploads.
- The portal does not process, record, reconcile, or track payments. Accounting and the School Cashier continue to use the official school system.
- Assessment booking, portal messaging, notifications, staff access, and audit history are in scope for the admission workflow.
- Keep academic operations (subjects, teacher loads, advisers, COR, career results, scholarships) out of the initial admission MVP unless a later phase explicitly includes them.

## Spreadsheet tabs and headers

Create these tabs in this order. Row 1 contains the exact headers shown. Do not add sample student data.

### 1. Settings
`SettingKey,SettingValue,Description,IsActive,UpdatedAt,UpdatedByUserID`

Use for school identity, active admission cycle, allowed application statuses, assessment settings, and public contact details. Do not store secrets, API keys, password peppers, or session tokens in this sheet.

### 2. Users
`UserID,Email,PasswordHash,PasswordSalt,Role,AccountStatus,EmailVerifiedAt,MustChangePassword,FailedLoginCount,LockedUntil,LastLoginAt,CreatedAt,UpdatedAt`

One row per login identity. Roles initially: Parent, Student, AdmissionsStaff, Admin. Store only salted password hashes produced server-side; never store plaintext passwords. Restrict this tab to trusted administrators and backend access.

### 3. ParentProfiles
`ParentID,UserID,FirstName,MiddleName,LastName,Suffix,MobileNumber,AlternateMobile,Email,RelationshipToStudent,AddressLine1,AddressLine2,Barangay,City,Province,PostalCode,CreatedAt,UpdatedAt`

Keep parent/guardian identity and contact details separate from student data.

### 4. StudentProfiles
`StudentID,UserID,LRN,FirstName,MiddleName,LastName,Suffix,PreferredName,Birthdate,Birthplace,Sex,Nationality,Religion,ReligionOther,MobileNumber,Email,AddressLine1,AddressLine2,Barangay,City,Province,PostalCode,PreviousSchool,PreviousSchoolAddress,PreviousSchoolYear,PreviousGradeLevel,ProfileStatus,CreatedAt,UpdatedAt`

`UserID` may be blank until a student account is created or linked. Avoid duplicating parent contact fields here.

### 5. ParentStudentLinks
`LinkID,ParentID,StudentID,Relationship,IsPrimaryContact,CanViewApplication,CanReceiveNotifications,ConsentStatus,LinkedAt,LinkedByUserID,UpdatedAt`

Supports multiple children per parent and multiple authorized guardians per student. Enforce authorization in server-side code, not by hiding UI controls alone.

### 6. Applications
`ApplicationID,StudentID,SchoolYear,AdmissionType,ApplyingGradeLevel,ApplyingDepartment,ApplyingCluster,ApplicationStatus,SubmittedAt,ReviewedAt,ReviewedByUserID,Decision,DecisionAt,DecisionByUserID,StaffNotes,CreatedAt,UpdatedAt`

A student may have multiple applications across admission cycles. Keep application-specific status and decision history separate from the long-lived student profile.

### 7. AdmissionRequirements
`RequirementID,ApplicationID,StudentID,RequirementType,IsRequired,SubmissionStatus,ReceivedDate,ReceivedByUserID,VerificationStatus,VerifiedByUserID,VerifiedAt,Remarks,CreatedAt,UpdatedAt`

Staff record physical submission only. Suggested values:
- `SubmissionStatus`: Pending, Received, Not Required
- `VerificationStatus`: Pending, Verified, Rejected

Seed requirement rows for each application based on the approved requirement checklist. No upload URLs or file IDs.

### 8. AssessmentSlots
`SlotID,SchoolYear,AssessmentType,StartAt,EndAt,Capacity,BookedCount,Location,Instructions,SlotStatus,CreatedAt,UpdatedAt,CreatedByUserID`

Only active slots with remaining capacity may be booked. Capacity changes and booking operations must be validated server-side.

### 9. AssessmentBookings
`BookingID,ApplicationID,StudentID,SlotID,BookingStatus,BookedAt,BookedByUserID,AttendanceStatus,StaffNotes,UpdatedAt`

Suggested booking statuses: Booked, Rescheduled, Cancelled, Completed, NoShow. Prevent duplicate active bookings for the same application unless an authorized staff action permits it.

### 10. Messages
`MessageID,ThreadID,ApplicationID,SenderUserID,RecipientUserID,MessageBody,SentAt,ReadAt,MessageStatus`

Use a thread identifier to group conversations. Do not place sensitive credentials or payment details in messages.

### 11. Notifications
`NotificationID,UserID,ApplicationID,NotificationType,Title,Body,RelatedRecordID,IsRead,CreatedAt,ReadAt`

Notifications are informational. Do not use them as the authoritative record of application status.

### 12. StaffAccess
`StaffAccessID,UserID,StaffName,Designation,Department,AccessRole,AccessScope,IsActive,GrantedAt,GrantedByUserID,RevokedAt,RevokedByUserID`

Apply least-privilege access. Every protected server function must validate the current user's role and scope.

### 13. AuditLogs
`AuditID,ActorUserID,ActorRole,Action,EntityType,EntityID,BeforeValue,AfterValue,IPAddress,UserAgent,CreatedAt`

Append-only from the application. Log authentication/security events and material changes to profiles, applications, requirements, bookings, and staff permissions. Avoid copying unnecessary sensitive personal data into audit values.

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
| Fees / Fee Notes | Excluded from this portal; official school payment system remains authoritative |
| Subjects / Teacher Loads / Advisers | Future academic operations module |
| Career Results / COR Settings / Scholarships | Future phase; confirm scope before designing |

## Data and spreadsheet setup rules

1. Create a new, blank Google Spreadsheet. Do not upload or duplicate the legacy workbook as the live database.
2. Add the 13 tabs above, preserving exact tab names and header order.
3. Freeze row 1 and enable filters on each tab.
4. Store dates as actual date/time values, not formatted text. Use a consistent timezone policy (Asia/Manila for displayed school operations).
5. Treat IDs as immutable text identifiers generated by the backend. Do not use row numbers as IDs.
6. Do not add formulas that expose or derive password hashes, access rights, or sensitive personal data.
7. Protect Users, StaffAccess, and AuditLogs from routine manual editing. Restrict spreadsheet sharing to authorized administrators and the service account.
8. Do not import personal data from the uploaded legacy workbook into the new spreadsheet at this stage.
9. Add validation lists for status fields only after the approved status vocabulary is finalized.
10. The Apps Script backend must validate all writes, authorization, required fields, and allowed status transitions.

## Open decisions before production

- Confirm final admission requirement checklist by grade level/admission type.
- Confirm exact application lifecycle statuses and decision labels.
- Confirm whether students must have their own login at initial launch or may be linked later.
- Confirm assessment types, slot duration, capacity, and rescheduling policy.
- Confirm retention periods and who may access sensitive student/guardian fields.
- Confirm whether Flags and email queue functionality are needed in the first release.
