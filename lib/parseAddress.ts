/** Parse Google address_components into street / city / state / zip */

export type ParsedAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

function pick(components: AddressComponent[], type: string, short = false): string {
  const c = components.find((x) => x.types.includes(type));
  return short ? c?.short_name ?? "" : c?.long_name ?? "";
}

export function parseAddressComponents(
  components: AddressComponent[]
): ParsedAddress {
  const streetNumber = pick(components, "street_number");
  const route = pick(components, "route");
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    pick(components, "locality") ||
    pick(components, "postal_town") ||
    pick(components, "sublocality") ||
    pick(components, "administrative_area_level_2");
  const state = pick(components, "administrative_area_level_1", true);
  const zip = pick(components, "postal_code");
  return { street, city, state, zip };
}

/** Extract 5-digit US ZIP from free text (e.g. "80201, Denver, CO") */
export function extractUsZip(text: string): string | null {
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}
