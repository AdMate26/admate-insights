// Breakdown exports (Audience insight): the same campaign numbers split by age &
// gender, location, placement, device or hour. One kind per file.

export const BREAKDOWN_KINDS = ["age_gender", "location", "placement", "device", "hour"] as const;
export type BreakdownKind = (typeof BREAKDOWN_KINDS)[number];
export const BREAKDOWN_LABEL: Record<BreakdownKind, string> = {
  age_gender: "Age & gender",
  location: "Location",
  placement: "Placement",
  device: "Device",
  hour: "Time of day",
};

export type BreakdownDim = "age" | "gender" | "region" | "placement" | "publisherPlatform" | "device" | "hour";

// Header aliases (after normaliseHeader). Shared by all platforms.
export const BREAKDOWN_HEADERS: [string, BreakdownDim][] = [
  ["age", "age"],
  ["age range", "age"],
  ["gender", "gender"],
  ["region", "region"],
  ["country", "region"],
  ["country territory", "region"],
  ["dma region", "region"],
  ["province", "region"],
  ["city", "region"],
  ["location", "region"],
  ["region user location", "region"],
  ["city user location", "region"],
  ["placement", "placement"],
  ["position", "placement"],
  ["impression device", "device"],
  ["device platform", "device"],
  ["device", "device"],
  ["os", "device"],
  ["time of day ad account time zone", "hour"],
  ["time of day viewer's time zone", "hour"],
  ["time of day viewers time zone", "hour"],
  ["hour of the day", "hour"],
  ["hour of day", "hour"],
  ["hour", "hour"],
];
// Meta's "Platform" column (Facebook / Instagram / Audience Network / Messenger) only
// means placement in Meta exports.
export const META_BREAKDOWN_HEADERS: [string, BreakdownDim][] = [["platform", "publisherPlatform"]];

export function breakdownKind(dims: Set<BreakdownDim>): BreakdownKind | null {
  if (dims.has("age") || dims.has("gender")) return "age_gender";
  if (dims.has("region")) return "location";
  if (dims.has("placement") || dims.has("publisherPlatform")) return "placement";
  if (dims.has("device")) return "device";
  if (dims.has("hour")) return "hour";
  return null;
}

const cap = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

function ageText(v: string): string {
  return v.replace(/\s*-\s*/g, "–").replace(/^(\d+)\+$/, "$1+");
}
function genderText(v: string): string {
  const t = v.toLowerCase();
  if (/^(female|women|woman|f)$/.test(t)) return "Women";
  if (/^(male|men|man|m)$/.test(t)) return "Men";
  return "Unknown gender";
}
function hourText(v: string): string | null {
  const m = /^(\d{1,2})(?::\d{2})?/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? `${String(h).padStart(2, "0")}:00` : null;
}

// The group a row belongs to, e.g. "Women 25–34", "Phnom Penh", "Instagram Reels", "13:00".
export function segmentName(kind: BreakdownKind, cell: Partial<Record<BreakdownDim, string | null>>): string | null {
  switch (kind) {
    case "age_gender": {
      const age = cell.age ? ageText(cell.age) : null;
      const gender = cell.gender ? genderText(cell.gender) : null;
      if (age && gender) return `${gender} ${age}`;
      if (age) return age.toLowerCase() === "unknown" ? "Unknown age" : `Age ${age}`;
      return gender;
    }
    case "location":
      return cell.region ? cell.region.trim() : null;
    case "placement": {
      const place = cell.placement ? cap(cell.placement.replace(/_/g, " ").trim().toLowerCase()) : null;
      const pub = cell.publisherPlatform ? cap(cell.publisherPlatform.replace(/_/g, " ").trim().toLowerCase()) : null;
      if (place && pub && !place.toLowerCase().includes(pub.toLowerCase())) return `${pub} ${place}`;
      return place ?? pub;
    }
    case "device":
      return cell.device ? cap(cell.device.replace(/_/g, " ").trim().toLowerCase()) : null;
    case "hour":
      return cell.hour ? hourText(cell.hour) : null;
  }
}
