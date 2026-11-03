/** Moreh Academy Admission Portal — configuration and schema contract. */
const AP_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1xN57zMBKmKkxlik2ZiPqJl_eK_38635Z32x-jsaCJDY',
  TIME_ZONE: 'Asia/Manila',
  SCHOOL_NAME: 'Moreh Academy',
  SCHEMA_VERSION: '1.1.0'
});
const AP_SCHEMA = Object.freeze({
Settings:['SettingKey','SettingValue','Description','IsActive','UpdatedAt','UpdatedByUserID'],
Users:['UserID','Email','PasswordHash','PasswordSalt','Role','AccountStatus','EmailVerifiedAt','MustChangePassword','FailedLoginCount','LockedUntil','LastLoginAt','CreatedAt','UpdatedAt'],
ParentProfiles:['ParentID','UserID','FirstName','MiddleName','LastName','Suffix','MobileNumber','AlternateMobile','Email','RelationshipToStudent','AddressLine1','AddressLine2','Barangay','City','Province','PostalCode','CreatedAt','UpdatedAt'],
StudentProfiles:['StudentID','UserID','LRN','FirstName','MiddleName','LastName','Suffix','PreferredName','Birthdate','Birthplace','Sex','Nationality','Religion','ReligionOther','MobileNumber','Email','AddressLine1','AddressLine2','Barangay','City','Province','PostalCode','PreviousSchool','PreviousSchoolAddress','PreviousSchoolYear','PreviousGradeLevel','ProfileStatus','CreatedAt','UpdatedAt'],
ParentStudentLinks:['LinkID','ParentID','StudentID','Relationship','IsPrimaryContact','CanViewApplication','CanReceiveNotifications','ConsentStatus','LinkedAt','LinkedByUserID','UpdatedAt'],
Applications:['ApplicationID','StudentID','SchoolYear','AdmissionType','ApplyingGradeLevel','ApplyingDepartment','ApplyingCluster','ApplicationStatus','SubmittedAt','ReviewedAt','ReviewedByUserID','Decision','DecisionAt','DecisionByUserID','StaffNotes','CreatedAt','UpdatedAt'],
AdmissionRequirements:['RequirementID','ApplicationID','StudentID','RequirementType','IsRequired','SubmissionStatus','ReceivedDate','ReceivedByUserID','VerificationStatus','VerifiedByUserID','VerifiedAt','Remarks','CreatedAt','UpdatedAt'],
AssessmentSlots:['SlotID','SchoolYear','AssessmentType','StartAt','EndAt','Capacity','BookedCount','Location','Instructions','SlotStatus','CreatedAt','UpdatedAt','CreatedByUserID'],
AssessmentBookings:['BookingID','ApplicationID','StudentID','SlotID','BookingStatus','BookedAt','BookedByUserID','AttendanceStatus','StaffNotes','UpdatedAt'],
Messages:['MessageID','ThreadID','ApplicationID','SenderUserID','RecipientUserID','MessageBody','SentAt','ReadAt','MessageStatus'],
Notifications:['NotificationID','UserID','ApplicationID','NotificationType','Title','Body','RelatedRecordID','IsRead','CreatedAt','ReadAt'],
StaffAccess:['StaffAccessID','UserID','StaffName','Designation','Department','AccessRole','AccessScope','IsActive','GrantedAt','GrantedByUserID','RevokedAt','RevokedByUserID'],
AuditLogs:['AuditID','ActorUserID','ActorRole','Action','EntityType','EntityID','BeforeValue','AfterValue','IPAddress','UserAgent','CreatedAt'],
AuthChallenges:['ChallengeID','Email','Purpose','CodeHash','ExpiresAt','Attempts','MaxAttempts','Status','CreatedAt','LastSentAt'],
Sessions:['SessionID','UserID','TokenHash','CreatedAt','ExpiresAt','LastSeenAt','RevokedAt','UserAgent']
});
