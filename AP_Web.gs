/** Minimal web entry point. Registration and staff functions are not enabled. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('AP_Index')
    .setTitle('Moreh Academy | Admission Portal')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function AP_getPublicStatus() {
  return {school:AP_CONFIG.SCHOOL_NAME,schemaVersion:AP_CONFIG.SCHEMA_VERSION,
    message:'Portal foundation installed. Applicant services are not yet enabled.'};
}
