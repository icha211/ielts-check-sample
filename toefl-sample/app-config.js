/**
 * Application Configuration
 * 
 * This file sets up the runtime configuration for the IELTS Check Sample application.
 * It defines the API gateway URL and other environment-specific settings.
 */

// Production Cloud Run API Gateway URL
window.__TOEFL_API_GATEWAY_URL__ = 'https://ielts-api-gateway-753959270698.asia-southeast1.run.app';

// Optional: Development overrides (uncomment to use local development server)
// if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
//     window.__TOEFL_API_GATEWAY_URL__ = 'http://localhost:8000';
// }

console.log('[Config] API Gateway URL set to:', window.__TOEFL_API_GATEWAY_URL__);
