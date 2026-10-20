const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-US");
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export const formatCurrency = (value: number) => currency.format(value);
export const formatInteger = (value: number) => integer.format(value);
export const formatPercent = (value: number | null) => (value === null ? "—" : percent.format(value));
export const formatDate = (value: string | Date | null) => (value === null ? "—" : date.format(new Date(value)));
