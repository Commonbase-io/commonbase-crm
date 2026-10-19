export const COMPANY_ALIASES: Record<string, string[]> = {
  name: ["name", "company", "companyname", "account", "accountname"],
  domain: ["domain", "website", "url", "web"],
  phone: ["phone", "telephone", "tel"],
  addressLine1: ["address", "address1", "addressline1", "street"],
  addressLine2: ["address2", "addressline2"],
  city: ["city", "town"],
  region: ["region", "state", "province"],
  postalCode: ["postalcode", "zip", "zipcode", "postcode"],
  country: ["country"],
  notes: ["notes", "note", "description"],
};

export const CONTACT_ALIASES: Record<string, string[]> = {
  firstName: ["firstname", "first", "givenname"],
  lastName: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress"],
  phone: ["phone", "telephone", "mobile"],
  title: ["title", "jobtitle", "role"],
  companyDomain: ["companydomain", "domain", "website", "company"],
  notes: ["notes", "note"],
};

export type ImportRow = {
  rowNumber: number;
  values: Record<string, string>;
  status: "valid" | "invalid" | "duplicate";
  errors: string[];
};
