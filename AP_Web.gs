/** Minimal web entry point for the admission portal foundation. */
function doGet() {
  return HtmlService.createTemplateFromFile('AP_Index')
    .evaluate()
    .setTitle('Admission Portal')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Include a reusable HTML partial in an Apps Script template. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function AP_getPublicStatus() {
  return {
    school: AP_CONFIG.SCHOOL_NAME,
    schemaVersion: AP_CONFIG.SCHEMA_VERSION,
    message: 'Portal design foundation installed. Applicant services are not yet enabled.'
  };
}
