/**
 * FMCSA / SaferWatch integration.
 * Replace the placeholder below with a real FMCSA API call when credentials are available.
 * Docs: https://mobile.fmcsa.dot.gov/developer/home.page
 */
async function verifyMCDOT(mcNumber, dotNumber) {
  if (process.env.FMCSA_API_KEY) {
    try {
      const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${dotNumber}?webKey=${process.env.FMCSA_API_KEY}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const carrier = data?.content?.carrier;
        return {
          dotNumber,
          mcNumber,
          legalName: carrier?.legalName,
          operatingStatus: carrier?.allowedToOperate === 'Y' ? 'Authorized' : 'Not Authorized',
          safetyRating: carrier?.safetyRating || 'Not Rated',
          insuranceOnFile: carrier?.bipdRequiredAmount ? 'Yes' : 'Unknown',
          source: 'FMCSA',
          verifiedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('FMCSA lookup failed:', err.message);
    }
  }

  // Placeholder response when API key not configured
  console.log(`[FMCSA PLACEHOLDER] MC: ${mcNumber} DOT: ${dotNumber}`);
  return {
    dotNumber,
    mcNumber,
    operatingStatus: 'Pending Verification',
    safetyRating: 'Not Rated',
    insuranceOnFile: 'Unknown',
    source: 'Placeholder — configure FMCSA_API_KEY',
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = { verifyMCDOT };
