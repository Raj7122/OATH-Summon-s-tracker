/**
 * Invoice template defaults and static content
 * Based on Arthur L. Miller's invoice template
 */

export const SENDER = {
  name: 'Arthur L. Miller',
  title: 'Attorney at Law',
  address: '67-05 Alderton Street',
  cityStateZip: 'Rego Park, NY 11374',
  phone: '718.997.0641',
  fax: '718.997.0245',
  email: 'arthur@amlawny.com',
};

export const DEFAULT_LEGAL_FEE = 250;

export const INVOICE_SUBJECT = 'NYC OATH – CITIZEN COMPLAINT ENGINE IDLING SUMMONSES';

export const INVOICE_SUBTITLE = 'Miscellaneous Engine Idling Summonses as listed below';

export const COURT_NAME = 'Office of Administrative Trials and Hearings (OATH)';

export const SERVICES_DESCRIPTION =
  'FOR PROFESSIONAL SERVICES in connection with the above-referenced matters ' +
  'including all court appearances; obtain and review evidence; where appropriate, ' +
  'assist with defense; vacate and bring to hearing or reduce defaulted summonses.';

export const FOOTER_TEXT = {
  payment:
    'Legal fee due in advance. May be paid via Zelle, Venmo, credit card or check. ' +
    'A credit card authorization form is attached.',
  review:
    'Please review and let me know if there are any defenses or explanations ' +
    'that would justify the vehicles to be idling on the cited times and dates and locations.',
  overdue:
    'You have an overdue fine that is due to the Oath Court for a completed hearing. ' +
    'You can pay this fine online using the following link:',
  cityPayUrl: 'https://a836-citypay.nyc.gov/citypay/ecb',
  questions: 'Let me know if you have any questions or require additional information.',
  closing: 'We look forward to working with you.',
};

// LocalStorage keys
export const STORAGE_KEYS = {
  cart: 'oath-invoice-cart',
  recipient: 'oath-invoice-recipient',
};

// Default empty recipient
export const DEFAULT_RECIPIENT = {
  companyName: '',
  address: '',
  cityStateZip: '',
  attention: '',
  email: '',
};
