import API_CONFIG, { GOOGLE_API_KEY, SHEET_IDS } from './config/apiConfig';

test('API_CONFIG exports essential credentials and sheet mappings', () => {
  expect(GOOGLE_API_KEY).toBeDefined();
  expect(SHEET_IDS.RGP_NEW).toBeDefined();
  expect(SHEET_IDS.PURCHASE_ORDER).toBeDefined();
  expect(API_CONFIG).toBeDefined();
});


