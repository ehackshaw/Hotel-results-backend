
/*
========================================================
BOKKARA HOTEL RESULTS BACKEND
File: api/hotelresults.js

- Up to 20 hotels per request
- One SerpApi request per batch
- Improved property address extraction
- Supports nested and structured addresses
- No separate hotel-details requests
- Preserves Shopify frontend response fields
========================================================
*/

const SERPAPI_URL = "https://serpapi.com/search.json";
const PAGE_SIZE = 20;
const TIMEOUT = Number(
  process.env.BOKKARA_SEARCH_TIMEOUT_MS || 20000
);

/* =========================
   HELPERS
========================= */

function first(...values) {
  return values.find(
    v => v !== undefined && v !== null && v !== ""
  ) ?? null;
}

function text(value) {
  if (value == null || typeof value === "object") {
    return "";
  }

  const result = String(value).trim();

  return /^(undefined|null|nan|\[object object\])$/i
    .test(result)
    ? ""
    : result;
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  if (value == null || value === "") return null;

  if (typeof value === "object") {
    return number(first(
      value.extracted_lowest,
      value.extracted_price,
      value.amount,
      value.value,
      value.extracted
    ));
  }

  const n = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(n) ? n : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max, fallback) {
  const n = number(value);

  return n === null
    ? fallback
    : Math.max(min, Math.min(max, Math.trunc(n)));
}

function boolean(value) {
  return value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true";
}

function validURL(value) {
  const s = text(value);
  return /^https?:\/\//i.test(s) ? s : "";
}

/* =========================
   DATE HANDLING
========================= */

function normalizeDate(value) {
  const input = text(value);
  if (!input) return "";

  let year, month, day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    [year, month, day] = input.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    [day, month, year] = input.split("/").map(Number);
  } else {
    const parsed = new Date(input);

    if (!Number.isFinite(parsed.getTime())) {
      return "";
    }

    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }

  const check = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    return "";
  }

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

/* =========================
   SEARCH PARAMETERS
========================= */

function parseSearch(req) {
  const source = req.method === "POST"
    ? object(req.body)
    : object(req.query);

  const currency = text(
    source.currency
  ).toUpperCase();

  return {
    destination: text(first(
      source.destination,
      source.q,
      source.location
    )),

    check_in_date: normalizeDate(first(
      source.checkin,
      source.check_in_date,
      source.checkIn
    )),

    check_out_date: normalizeDate(first(
      source.checkout,
      source.check_out_date,
      source.checkOut
    )),

    rooms: clamp(source.rooms, 1, 10, 1),
    adults: clamp(source.adults, 1, 40, 1),
    children: clamp(source.children, 0, 40, 0),
    babies: clamp(source.babies, 0, 40, 0),
    seniors: clamp(source.seniors, 0, 40, 0),

    currency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : "USD",

    limit: clamp(
      source.limit,
      1,
      PAGE_SIZE,
      PAGE_SIZE
    ),

    page_token: text(first(
      source.page_token,
      source.next_page_token
    )),

    sort: text(source.sort) || "recommended"
  };
}

function validateSearch(q) {
  if (!q.destination) {
    throw new Error("Destination is required.");
  }

  if (!q.check_in_date || !q.check_out_date) {
    throw new Error(
      "Valid check-in and check-out dates are required."
    );
  }

  if (q.check_out_date <= q.check_in_date) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}

/* =========================
   ADDRESS EXTRACTION
========================= */

function cleanAddress(value) {
  if (typeof value === "string") {
    return text(value.replace(/\s+/g, " "));
  }

  if (Array.isArray(value)) {
    return value
      .map(cleanAddress)
      .filter(Boolean)
      .join(", ");
  }

  const d = object(value);

  const formatted = first(
    d.formatted_address,
    d.formattedAddress,
    d.full_address,
    d.fullAddress,
    d.display_name,
    d.address
  );

  if (typeof formatted === "string") {
    return cleanAddress(formatted);
  }

  const street = first(
    d.street_address,
    d.streetAddress,
    d.street,
    d.address_line1,
    d.addressLine1,
    d.address1,
    d.line1,
    d.route,
    d.road
  );

  const streetNumber = first(
    d.street_number,
    d.streetNumber,
    d.house_number
  );

  const streetLine = [
    streetNumber,
    street
  ].filter(Boolean).map(text).join(" ");

  return [
    streetLine,
    first(d.address_line2, d.line2),
    first(d.city, d.locality, d.town),
    first(d.state, d.region),
    first(d.postal_code, d.postcode, d.zip),
    d.country
  ].map(text).filter(Boolean).join(", ");
}

function looksLikeStreet(value) {
  const s = cleanAddress(value);

  if (!s) return false;

  if (/^(property address unavailable|undefined|null)$/i.test(s)) {
    return false;
  }

  const roadPattern =
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|parkway|pkwy\.?|square|plaza|calle|rue|paseo|route|quay|promenade|strasse|straße|via|viale|corso|chemin)\b/i;

  const numbered =
    /(?:^|,)\s*\d{1,6}[a-z]?(?:[\s,-]|$)/i;

  return roadPattern.test(s) || numbered.test(s);
}

function extractLocation(raw) {
  const data = object(raw);

  const sources = [
    data,
    object(data.location),
    object(data.property),
    object(data.hotel),
    object(data.details),
    object(data.hotel_details),
    object(data.property_details),
    object(data.address_components),
    object(data.contact),
    object(data.contact_info)
  ];

  const fields = [
    "address",
    "formatted_address",
    "formattedAddress",
    "full_address",
    "fullAddress",
    "street_address",
    "streetAddress",
    "hotel_address",
    "property_address",
    "address_line1",
    "address1",
    "vicinity",
    "display_address",
    "postal_address"
  ];

  const candidates = [];

  for (const source of sources) {
    for (const field of fields) {
      const address = cleanAddress(source[field]);

      if (address) {
        candidates.push({
          address,
          source: field
        });
      }
    }

    const structured = cleanAddress({
      street_number: first(
        source.street_number,
        source.house_number
      ),
      street: first(
        source.street,
        source.road,
        source.route
      ),
      city: source.city,
      state: source.state,
      country: source.country,
      postal_code: source.postal_code
    });

    if (structured) {
      candidates.push({
        address: structured,
        source: "structured"
      });
    }
  }

  const streetMatch = candidates.find(
    item => looksLikeStreet(item.address)
  );

  const street = streetMatch?.address || "";

  const neighborhood = text(first(
    data.neighborhood,
    data.district,
    data.location?.neighborhood
  ));

  const city = text(first(
    data.city,
    data.locality,
    data.location?.city
  ));

  const region = text(first(
    data.state,
    data.region,
    data.location?.region
  ));

  const country = text(first(
    data.country,
    data.location?.country
  ));

  const area = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  const label =
    street ||
    candidates[0]?.address ||
    area ||
    "";

  return {
    address: street,
    formatted_address: street,
    address_available: Boolean(street),
    address_source: streetMatch?.source || "",
    location_label: label,
    location_type: street
      ? "street"
      : label
        ? "area"
        : "unavailable",
    neighborhood,
    city,
    region,
    country
  };
}

/* =========================
   HOTEL IMAGES
========================= */

function extractPhotos(raw) {
  const h = object(raw);

  const sources = [
    h.thumbnail,
    h.image,
    h.image_url,
    h.main_image,
    h.photo,
    ...array(h.images),
    ...array(h.photos),
    ...array(h.hotel_images),
    ...array(h.hotel_photos)
  ];

  return unique(
    sources.map(item => {
      const value = typeof item === "string"
        ? item
        : first(
            item?.original_image,
            item?.image,
            item?.url,
            item?.thumbnail,
            item?.src,
            item?.large
          );

      return validURL(value);
    })
  );
}

/* =========================
   HOTEL AMENITIES
========================= */

function extractAmenities(raw) {
  const h = object(raw);

  const source = first(
    h.amenities,
    h.hotel_amenities,
    h.facilities,
    []
  );

  const values = Array.isArray(source)
    ? source
    : typeof source === "string"
      ? source.split(",")
      : Object.values(object(source)).flat();

  return unique(
    values.map(item =>
      typeof item === "string"
        ? text(item)
        : text(first(
            item?.name,
            item?.title,
            item?.label
          ))
    )
  );
}

/* =========================
   HOTEL NORMALIZATION
========================= */

function normalizeHotel(raw, index, q) {
  const h = object(raw);

  const name = text(first(
    h.name,
    h.hotel_name,
    h.property_name,
    h.title
  ));

  if (!name) return null;

  const location = extractLocation(h);
  const images = extractPhotos(h);
  const amenities = extractAmenities(h);

  const gps = object(first(
    h.gps_coordinates,
    h.coordinates
  ));

  const latitude = number(first(
    gps.latitude,
    gps.lat,
    h.latitude,
    h.lat
  ));

  const longitude = number(first(
    gps.longitude,
    gps.lng,
    gps.long,
    h.longitude,
    h.long
  ));

  const propertyToken = text(first(
    h.property_token,
    h.propertyToken
  ));

  const nightlyPrice = number(first(
    h.rate_per_night?.extracted_lowest,
    h.rate_per_night?.extracted_price,
    h.extracted_price,
    h.price_per_night,
    h.price
  ));

  const totalPrice = number(first(
    h.total_rate?.extracted_lowest,
    h.total_rate?.extracted_price,
    h.total_price
  ));

  const stars = number(first(
    h.extracted_hotel_class,
    h.hotel_class,
    h.stars
  ));

  const rating = number(first(
    h.overall_rating,
    h.rating,
    h.guest_rating
  ));

  const reviews = number(first(
    h.reviews,
    h.review_count,
    h.total_reviews
  ));

  return {
    id: text(first(
      propertyToken,
      h.hotel_id,
      h.place_id,
      h.id,
      `${name}|${index}`
    )),

    index,
    name,

    type: text(h.type) || "hotel",

    description: text(first(
      h.description,
      h.hotel_description
    )),

    property_token: propertyToken,
    hotel_id: text(h.hotel_id),
    place_id: text(h.place_id),

    ...location,

    stars,
    hotel_class: stars,

    rating,
    reviews,
    review_count: reviews,

    rating_description: text(first(
      h.rating_description,
      h.rating_text
    )),

    price: nightlyPrice,
    extracted_price: nightlyPrice,
    price_per_night: nightlyPrice,
    total_price: totalPrice,

    currency: q.currency,

    images,
    photos: images,
    image: images[0] || "",
    thumbnail: images[0] || "",
    image_count: images.length,

    amenities,

    free_cancellation: boolean(
      h.free_cancellation
    ),

    free_breakfast: boolean(
      h.free_breakfast
    ),

    latitude,
    longitude,
    lat: latitude,
    long: longitude,

    deal: h.deal || "",
    deal_description: text(
      h.deal_description
    ),

    sponsored: boolean(h.sponsored),
    eco_certified: boolean(h.eco_certified),

    serpapi_property_details_link: text(
      h.serpapi_property_details_link
    ),

    details_requested: false,
    details_loaded: false,
    details_error: ""
  };
}

/* =========================
   SERPAPI REQUEST
========================= */

async function serpapiRequest(params) {
  const url = new URL(SERPAPI_URL);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(TIMEOUT)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      text(data.error) ||
      `SerpApi HTTP ${response.status}`
    );
  }

  return data;
}

/* =========================
   GOOGLE HOTELS SEARCH
========================= */

async function searchHotels(q, apiKey) {
  const params = {
    engine: "google_hotels",
    api_key: apiKey,

    q: q.destination,

    check_in_date: q.check_in_date,
    check_out_date: q.check_out_date,

    adults: q.adults,
    children: q.children,

    currency: q.currency,
    hl: "en",
    gl: "us"
  };

  if (q.page_token) {
    params.next_page_token = q.page_token;
  }

  return serpapiRequest(params);
}

/* =========================
   EXTRACT PROPERTIES
========================= */

function extractProperties(data) {
  return [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties
  ].find(Array.isArray) || [];
}

/* =========================
   PAGINATION
========================= */

function getNextPageToken(data) {
  return text(first(
    data?.serpapi_pagination?.next_page_token,
    data?.pagination?.next_page_token,
    data?.next_page_token
  ));
}

/* =========================
   DEDUPLICATION
========================= */

function deduplicateHotels(rawProperties, q) {
  const hotels = [];
  const seen = new Set();

  for (
    let index = 0;
    index < rawProperties.length;
    index++
  ) {
    const hotel = normalizeHotel(
      rawProperties[index],
      index,
      q
    );

    if (!hotel) continue;

    const key = String(first(
      hotel.property_token,
      hotel.hotel_id,
      hotel.place_id,
      [
        hotel.name.toLowerCase(),
        hotel.latitude ?? "",
        hotel.longitude ?? ""
      ].join("|")
    )).toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    hotels.push(hotel);
  }

  return hotels;
}

/* =========================
   SORTING
========================= */

function sortHotels(hotels, sort) {
  const list = [...hotels];

  function compare(a, b, field, descending) {
    const x = a[field];
    const y = b[field];

    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;

    return descending ? y - x : x - y;
  }

  switch (sort) {
    case "price-low":
      list.sort(
        (a, b) => compare(a, b, "price", false)
      );
      break;

    case "price-high":
      list.sort(
        (a, b) => compare(a, b, "price", true)
      );
      break;

    case "rating":
      list.sort(
        (a, b) => compare(a, b, "rating", true)
      );
      break;

    case "stars":
      list.sort(
        (a, b) => compare(a, b, "stars", true)
      );
      break;
  }

  return list;
}

/* =========================
   MAIN VERCEL HANDLER
========================= */

export default async function handler(req, res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  const apiKey = first(
    process.env.SERPAPI_API_KEY,
    process.env.SERPAPI_KEY
  );

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "SERPAPI_API_KEY is missing."
    });
  }

  let q;

  try {
    q = parseSearch(req);
    validateSearch(q);
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  try {
    // Exactly one provider search request.

    const searchData = await searchHotels(
      q,
      apiKey
    );

    const rawProperties = extractProperties(
      searchData
    );

    const hotels = deduplicateHotels(
      rawProperties,
      q
    );

    const selectedHotels = sortHotels(
      hotels,
      q.sort
    ).slice(0, q.limit);

    const nextPageToken = getNextPageToken(
      searchData
    );

    const hasMore =
      Boolean(nextPageToken) &&
      nextPageToken !== q.page_token;

    const streetCount = selectedHotels.filter(
      h => h.address_available
    ).length;

    const areaCount = selectedHotels.filter(
      h =>
        !h.address_available &&
        h.location_type === "area"
    ).length;

    const missingCount = selectedHotels.filter(
      h => h.location_type === "unavailable"
    ).length;

    return res.status(200).json({
      success: true,

      hotels: selectedHotels,
      properties: selectedHotels,
      results: selectedHotels,

      search: q,

      pagination: {
        has_more: hasMore,
        next_page_token: hasMore
          ? nextPageToken
          : null,
        page_size: PAGE_SIZE,
        returned: selectedHotels.length
      },

      meta: {
        requested_limit: q.limit,
        raw_properties: rawProperties.length,
        unique_properties: hotels.length,
        returned_properties: selectedHotels.length,

        street_addresses: streetCount,
        area_locations: areaCount,
        unavailable_locations: missingCount,

        address_fields_present:
          selectedHotels.filter(
            h => h.address || h.location_label
          ).length,

        details_attempted: 0,
        details_succeeded: 0,
        details_failed: 0,

        serpapi_request_count: 1,
        shopify_request_count: 1,
        frontend_batch_size: PAGE_SIZE
      }
    });

  } catch (error) {
    console.error(
      "Bokkara hotel backend:",
      error
    );

    return res.status(502).json({
      success: false,
      error:
        error.message ||
        "Hotel search failed."
    });
  }
}
