
/*
============================================================
BOKKARA — HOTEL RESULTS BACKEND
PROPERTY ADDRESS ENRICHMENT
============================================================

FILE:
api/hotelresults.js

SHOPIFY:
One request to this endpoint.

BACKEND:
1. Search Google Hotels using SerpApi.
2. Collect returned properties.
3. Request Google Hotels property details internally.
4. Extract actual property addresses.
5. Merge details into hotel results.
6. Return one complete JSON response.

IMPORTANT:
Property details requests consume additional SerpApi
usage and may increase response time.

Environment:
SERPAPI_API_KEY

Optional:
BOKKARA_DETAIL_CONCURRENCY
BOKKARA_DETAIL_TIMEOUT_MS
BOKKARA_SEARCH_TIMEOUT_MS
BOKKARA_MAX_DETAIL_REQUESTS

============================================================
*/

const SERPAPI_URL =
  "https://serpapi.com/search.json";

const MAX_HOTELS = 100;

const DEFAULT_LIMIT = 100;

const DETAIL_CONCURRENCY = Math.max(
  1,
  Math.min(
    20,
    Number(
      process.env.BOKKARA_DETAIL_CONCURRENCY || 10
    )
  )
);

const DETAIL_TIMEOUT = Number(
  process.env.BOKKARA_DETAIL_TIMEOUT_MS || 7000
);

const SEARCH_TIMEOUT = Number(
  process.env.BOKKARA_SEARCH_TIMEOUT_MS || 20000
);

const MAX_DETAIL_REQUESTS = Math.max(
  0,
  Math.min(
    100,
    Number(
      process.env.BOKKARA_MAX_DETAIL_REQUESTS || 100
    )
  )
);


/* ==========================================================
   GENERAL HELPERS
========================================================== */

function first(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  ) ?? null;
}

function txt(value) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "object"
  ) {
    return "";
  }

  return String(value).trim();
}

function obj(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) ? value : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "object"
  ) {
    return num(
      first(
        value.extracted_lowest,
        value.extracted_price,
        value.amount,
        value.value,
        value.extracted
      )
    );
  }

  const n = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true"
  );
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

function validURL(value) {
  const s = txt(value);

  return /^https?:\/\//i.test(s)
    ? s
    : "";
}


/* ==========================================================
   DATE NORMALIZATION
========================================================== */

function normalizeDate(value) {
  const input = txt(value);

  if (!input) return "";

  let year;
  let month;
  let day;

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(input)
  ) {
    [year, month, day] =
      input.split("-").map(Number);

  } else if (
    /^\d{2}\/\d{2}\/\d{4}$/.test(input)
  ) {
    [day, month, year] =
      input.split("/").map(Number);

  } else {
    const date = new Date(input);

    if (
      !Number.isFinite(date.getTime())
    ) {
      return "";
    }

    year = date.getUTCFullYear();
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
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


/* ==========================================================
   SEARCH PARAMETERS
========================================================== */

function parseSearch(req) {
  const source =
    req.method === "POST"
      ? req.body || {}
      : req.query || {};

  const destination = txt(
    first(
      source.destination,
      source.q,
      source.location
    )
  );

  const checkin = normalizeDate(
    first(
      source.checkin,
      source.check_in_date,
      source.checkIn
    )
  );

  const checkout = normalizeDate(
    first(
      source.checkout,
      source.check_out_date,
      source.checkOut
    )
  );

  const limit = Math.max(
    1,
    Math.min(
      MAX_HOTELS,
      Math.trunc(
        num(
          first(
            source.limit,
            source.count,
            source.properties,
            DEFAULT_LIMIT
          )
        ) ?? DEFAULT_LIMIT
      )
    )
  );

  const currencyInput =
    txt(source.currency).toUpperCase();

  return {
    destination,

    check_in_date: checkin,

    check_out_date: checkout,

    rooms: Math.max(
      1,
      Math.trunc(num(source.rooms) ?? 1)
    ),

    adults: Math.max(
      1,
      Math.trunc(num(source.adults) ?? 1)
    ),

    children: Math.max(
      0,
      Math.trunc(num(source.children) ?? 0)
    ),

    babies: Math.max(
      0,
      Math.trunc(num(source.babies) ?? 0)
    ),

    seniors: Math.max(
      0,
      Math.trunc(num(source.seniors) ?? 0)
    ),

    guests: num(source.guests),

    currency:
      /^[A-Z]{3}$/.test(currencyInput)
        ? currencyInput
        : "USD",

    limit,

    sort:
      txt(source.sort) || "recommended"
  };
}

function validateSearch(q) {
  if (!q.destination) {
    throw new Error(
      "Destination is required."
    );
  }

  if (
    !q.check_in_date ||
    !q.check_out_date
  ) {
    throw new Error(
      "Valid check-in and check-out dates are required."
    );
  }

  if (
    q.check_out_date <= q.check_in_date
  ) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}


/* ==========================================================
   ADDRESS EXTRACTION
========================================================== */

function cleanAddress(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const s = value
      .replace(/\s+/g, " ")
      .trim();

    if (
      /^(undefined|null|nan|\[object object\])$/i
        .test(s)
    ) {
      return "";
    }

    return s;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return "";
  }

  const formatted = first(
    value.formatted_address,
    value.formattedAddress,
    value.full_address,
    value.fullAddress
  );

  if (formatted) {
    return cleanAddress(formatted);
  }

  const street = first(
    value.street_address,
    value.streetAddress,
    value.street,
    value.address_line1,
    value.addressLine1,
    value.address1,
    value.line1
  );

  if (street) {
    return unique([
      cleanAddress(street),
      cleanAddress(
        first(
          value.address_line2,
          value.addressLine2
        )
      ),
      cleanAddress(
        first(
          value.city,
          value.locality
        )
      ),
      cleanAddress(
        first(
          value.state,
          value.region
        )
      ),
      cleanAddress(
        first(
          value.postal_code,
          value.zip
        )
      ),
      cleanAddress(value.country)
    ]).join(", ");
  }

  return cleanAddress(value.address);
}

function looksLikeStreet(value) {
  const s = cleanAddress(value);

  if (!s) return false;

  const streetWords =
    /\b(street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|circle|parkway|pkwy\.?|square|trail|alley|plaza|calle|rue|paseo|strasse)\b/i;

  const numberPattern =
    /\b\d{1,6}[a-z]?\b/i;

  return (
    streetWords.test(s) &&
    numberPattern.test(s)
  );
}

function extractLocation(data) {
  const d = obj(data);

  const property = obj(d.property);
  const details = obj(d.details);
  const location = obj(d.location);
  const hotel = obj(d.hotel);

  const candidates = [
    ["address", d.address],
    ["formatted_address", d.formatted_address],
    ["full_address", d.full_address],
    ["street_address", d.street_address],
    ["hotel_address", d.hotel_address],
    ["property_address", d.property_address],
    ["location.address", location.address],
    ["property.address", property.address],
    ["details.address", details.address],
    ["hotel.address", hotel.address],
    ["property.formatted_address", property.formatted_address],
    ["details.formatted_address", details.formatted_address],
    ["hotel.formatted_address", hotel.formatted_address]
  ];

  let street = "";
  let source = "";
  let area = "";

  for (const [key, value] of candidates) {
    const address = cleanAddress(value);

    if (!address) continue;

    if (looksLikeStreet(address)) {
      street = address;
      source = key;
      break;
    }

    if (!area) {
      area = address;
    }
  }

  const neighborhood = txt(
    first(
      d.neighborhood,
      d.district,
      location.neighborhood,
      property.neighborhood
    )
  );

  const city = txt(
    first(
      d.city,
      d.locality,
      location.city,
      property.city
    )
  );

  const region = txt(
    first(
      d.state,
      d.region,
      location.region
    )
  );

  const country = txt(
    first(
      d.country,
      location.country
    )
  );

  const locality = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  return {
    address: street,

    formatted_address: street,

    address_available: Boolean(street),

    address_source: source,

    location_label:
      street || area || locality || "",

    location_type:
      street
        ? "street"
        : area || locality
          ? "area"
          : "unavailable",

    neighborhood,
    city,
    region,
    country
  };
}


/* ==========================================================
   PROPERTY DETAILS EXTRACTION
========================================================== */

/*
Google Hotels property details responses may contain
the hotel fields at the root or under a nested object.

We inspect the known response shapes.
*/

function extractDetailsObject(data) {
  const d = obj(data);

  const candidates = [
    d,
    d.property,
    d.hotel,
    d.hotel_details,
    d.property_details,
    d.details,
    d.data
  ];

  for (const candidate of candidates) {
    const item = obj(candidate);

    if (
      item.address ||
      item.formatted_address ||
      item.street_address ||
      item.hotel_address
    ) {
      return item;
    }
  }

  return d;
}


/* ==========================================================
   PHOTOS
========================================================== */

function extractPhotos(hotel) {
  const h = obj(hotel);

  const sources = [
    h.thumbnail,
    h.image,
    h.image_url,
    h.main_image,
    h.photo,
    ...arr(h.images),
    ...arr(h.photos),
    ...arr(h.hotel_images),
    ...arr(h.hotel_photos)
  ];

  return unique(
    sources.map(item => {
      const value =
        typeof item === "string"
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


/* ==========================================================
   AMENITIES
========================================================== */

function extractAmenities(hotel) {
  const h = obj(hotel);

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
      : Object.values(obj(source)).flat();

  return unique(
    values.map(item =>
      typeof item === "string"
        ? txt(item)
        : txt(
            first(
              item?.name,
              item?.title,
              item?.label
            )
          )
    )
  );
}


/* ==========================================================
   NORMALIZE PROPERTY
========================================================== */

function normalizeHotel(raw, index, q) {
  const h = obj(raw);

  const name = txt(
    first(
      h.name,
      h.hotel_name,
      h.property_name,
      h.title
    )
  );

  if (!name) return null;

  const location = extractLocation(h);

  const images = extractPhotos(h);

  const amenities = extractAmenities(h);

  const gps = obj(
    first(
      h.gps_coordinates,
      h.coordinates,
      {}
    )
  );

  const lat = num(
    first(
      gps.latitude,
      gps.lat,
      h.latitude,
      h.lat
    )
  );

  const long = num(
    first(
      gps.longitude,
      gps.lng,
      gps.long,
      h.longitude,
      h.long
    )
  );

  const token = txt(
    first(
      h.property_token,
      h.propertyToken
    )
  );

  const nightly = num(
    first(
      h.rate_per_night?.extracted_lowest,
      h.rate_per_night?.extracted_price,
      h.extracted_price,
      h.price_per_night,
      h.price
    )
  );

  const total = num(
    first(
      h.total_rate?.extracted_lowest,
      h.total_rate?.extracted_price,
      h.total_price
    )
  );

  const stars = num(
    first(
      h.extracted_hotel_class,
      h.hotel_class,
      h.stars
    )
  );

  const rating = num(
    first(
      h.overall_rating,
      h.rating,
      h.guest_rating
    )
  );

  const reviews = num(
    first(
      h.reviews,
      h.review_count,
      h.total_reviews
    )
  );

  return {
    id: txt(
      first(
        token,
        h.hotel_id,
        h.place_id,
        h.id,
        `${name}|${index}`
      )
    ),

    index,

    name,

    type: txt(
      first(
        h.type,
        "hotel"
      )
    ),

    description: txt(
      first(
        h.description,
        h.hotel_description
      )
    ),

    property_token: token,

    hotel_id: txt(h.hotel_id),

    place_id: txt(h.place_id),

    ...location,

    stars,

    hotel_class: stars,

    rating,

    reviews,

    review_count: reviews,

    price: nightly,

    extracted_price: nightly,

    price_per_night: nightly,

    total_price: total,

    currency: q.currency,

    images,

    image: images[0] || "",

    thumbnail: images[0] || "",

    image_count: images.length,

    amenities,

    free_cancellation:
      bool(h.free_cancellation),

    free_breakfast:
      bool(h.free_breakfast),

    lat,
    long,

    latitude: lat,
    longitude: long,

    deal: h.deal || "",

    deal_description:
      txt(h.deal_description),

    sponsored:
      bool(h.sponsored),

    eco_certified:
      bool(h.eco_certified),

    serpapi_property_details_link:
      txt(h.serpapi_property_details_link),

    /*
      New diagnostic fields.
    */

    details_requested: false,

    details_loaded: false,

    details_error: ""
  };
}


/* ==========================================================
   SERPAPI FETCH
========================================================== */

async function serpapiRequest(params, timeout) {
  const url = new URL(SERPAPI_URL);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const response = await fetch(
    url.toString(),
    {
      method: "GET",

      headers: {
        Accept: "application/json"
      },

      signal:
        AbortSignal.timeout(timeout)
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    data.error
  ) {
    throw new Error(
      txt(data.error) ||
      `SerpApi HTTP ${response.status}`
    );
  }

  return data;
}


/* ==========================================================
   GOOGLE HOTELS SEARCH
========================================================== */

async function searchHotels(q, apiKey) {
  return serpapiRequest(
    {
      engine: "google_hotels",

      api_key: apiKey,

      q: q.destination,

      check_in_date:
        q.check_in_date,

      check_out_date:
        q.check_out_date,

      adults: q.adults,

      children: q.children,

      currency: q.currency,

      hl: "en",

      gl: "us",

      num: q.limit
    },

    SEARCH_TIMEOUT
  );
}

function extractProperties(data) {
  const candidates = [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties
  ];

  return candidates.find(
    Array.isArray
  ) || [];
}


/* ==========================================================
   GOOGLE HOTELS PROPERTY DETAILS
========================================================== */

async function fetchPropertyDetails(
  hotel,
  q,
  apiKey
) {
  if (!hotel.property_token) {
    return null;
  }

  /*
    Google Hotels property details lookup.

    The property token comes directly from
    the initial Google Hotels search result.
  */

  return serpapiRequest(
    {
      engine: "google_hotels",

      api_key: apiKey,

      q: q.destination,

      property_token:
        hotel.property_token,

      check_in_date:
        q.check_in_date,

      check_out_date:
        q.check_out_date,

      adults: q.adults,

      children: q.children,

      currency: q.currency,

      hl: "en",

      gl: "us"
    },

    DETAIL_TIMEOUT
  );
}


/* ==========================================================
   MERGE PROPERTY DETAILS
========================================================== */

function mergePropertyDetails(
  hotel,
  response
) {
  const details =
    extractDetailsObject(response);

  const location =
    extractLocation(details);

  /*
    Only replace an existing address when
    details provide an actual street address.
  */

  if (location.address_available) {
    hotel.address =
      location.address;

    hotel.formatted_address =
      location.formatted_address;

    hotel.address_available = true;

    hotel.address_source =
      "property_details." +
      location.address_source;

    hotel.location_label =
      location.address;

    hotel.location_type = "street";
  }

  /*
    Area fallback.
  */

  if (
    !hotel.address_available &&
    location.location_label &&
    hotel.location_type === "unavailable"
  ) {
    hotel.location_label =
      location.location_label;

    hotel.location_type =
      location.location_type;
  }

  for (const field of [
    "neighborhood",
    "city",
    "region",
    "country"
  ]) {
    if (
      !hotel[field] &&
      location[field]
    ) {
      hotel[field] = location[field];
    }
  }

  /*
    Additional photos.
  */

  const detailPhotos =
    extractPhotos(details);

  hotel.images = unique([
    ...hotel.images,
    ...detailPhotos
  ]);

  hotel.image =
    hotel.images[0] || "";

  hotel.thumbnail =
    hotel.images[0] || "";

  hotel.image_count =
    hotel.images.length;

  /*
    Additional amenities.
  */

  hotel.amenities = unique([
    ...hotel.amenities,
    ...extractAmenities(details)
  ]);

  /*
    Description.
  */

  if (!hotel.description) {
    hotel.description = txt(
      first(
        details.description,
        details.hotel_description
      )
    );
  }

  hotel.details_loaded = true;

  return hotel;
}


/* ==========================================================
   CONCURRENT ENRICHMENT
========================================================== */

/*
Limits the number of simultaneous requests.

This avoids launching 100 requests at the
same instant.

All details requests happen on the backend.
The frontend receives one combined response.
*/

async function enrichHotels(
  hotels,
  q,
  apiKey
) {
  const eligible = hotels.filter(
    hotel =>
      hotel.property_token &&
      !hotel.address_available
  ).slice(
    0,
    MAX_DETAIL_REQUESTS
  );

  let cursor = 0;

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (cursor < eligible.length) {
      const index = cursor++;

      const hotel =
        eligible[index];

      hotel.details_requested = true;

      attempted++;

      try {
        const data =
          await fetchPropertyDetails(
            hotel,
            q,
            apiKey
          );

        if (data) {
          mergePropertyDetails(
            hotel,
            data
          );

          succeeded++;
        }

      } catch (error) {
        failed++;

        hotel.details_error =
          error.message || "Details failed";

        console.warn(
          "Bokkara property details:",
          hotel.name,
          hotel.details_error
        );
      }
    }
  }

  const workerCount = Math.min(
    DETAIL_CONCURRENCY,
    eligible.length
  );

  await Promise.all(
    Array.from(
      {length: workerCount},
      () => worker()
    )
  );

  return {
    attempted,
    succeeded,
    failed
  };
}


/* ==========================================================
   SORTING
========================================================== */

function sortHotels(hotels, sort) {
  const result = [...hotels];

  function compare(a,b,key,descending) {
    const x = a[key];
    const y = b[key];

    if (x == null && y == null) {
      return 0;
    }

    if (x == null) return 1;
    if (y == null) return -1;

    return descending
      ? y - x
      : x - y;
  }

  switch (sort) {
    case "price-low":
      result.sort(
        (a,b) =>
          compare(a,b,"price",false)
      );
      break;

    case "price-high":
      result.sort(
        (a,b) =>
          compare(a,b,"price",true)
      );
      break;

    case "rating":
      result.sort(
        (a,b) =>
          compare(a,b,"rating",true)
      );
      break;

    case "stars":
      result.sort(
        (a,b) =>
          compare(a,b,"stars",true)
      );
      break;

    default:
      break;
  }

  return result;
}


/* ==========================================================
   MAIN VERCEL HANDLER
========================================================== */

export default async function handler(
  req,
  res
) {
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

  const apiKey =
    process.env.SERPAPI_API_KEY ||
    process.env.SERPAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error:
        "SERPAPI_API_KEY is missing."
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

    /*
      STEP 1:
      Main Google Hotels search.
    */

    const searchData =
      await searchHotels(
        q,
        apiKey
      );

    const rawProperties =
      extractProperties(searchData);

    /*
      STEP 2:
      Normalize and deduplicate.
    */

    const hotels = [];
    const seen = new Set();

    for (
      let i = 0;
      i < rawProperties.length;
      i++
    ) {
      const hotel =
        normalizeHotel(
          rawProperties[i],
          i,
          q
        );

      if (!hotel) continue;

      const key = (
        hotel.property_token ||
        hotel.hotel_id ||
        hotel.place_id ||
        (
          hotel.name.toLowerCase() +
          "|" +
          (hotel.lat ?? "") +
          "|" +
          (hotel.long ?? "")
        )
      ).toLowerCase();

      if (seen.has(key)) continue;

      seen.add(key);

      hotels.push(hotel);
    }

    /*
      STEP 3:
      Select requested hotels.
    */

    const selectedHotels =
      sortHotels(
        hotels,
        q.sort
      ).slice(
        0,
        q.limit
      );

    /*
      STEP 4:
      Retrieve property details and addresses.
    */

    const enrichment =
      await enrichHotels(
        selectedHotels,
        q,
        apiKey
      );

    /*
      STEP 5:
      Address statistics.
    */

    const streetCount =
      selectedHotels.filter(
        h => h.address_available
      ).length;

    const areaCount =
      selectedHotels.filter(
        h =>
          !h.address_available &&
          h.location_type === "area"
      ).length;

    const missingCount =
      selectedHotels.filter(
        h =>
          h.location_type ===
          "unavailable"
      ).length;

    /*
      STEP 6:
      Return combined results.
    */

    return res.status(200).json({
      success: true,

      hotels:
        selectedHotels,

      properties:
        selectedHotels,

      results:
        selectedHotels,

      search: q,

      pagination: {
        has_more: false,
        next_page_token: null
      },

      meta: {
        requested_limit:
          q.limit,

        raw_properties:
          rawProperties.length,

        unique_properties:
          hotels.length,

        returned_properties:
          selectedHotels.length,

        street_addresses:
          streetCount,

        area_locations:
          areaCount,

        unavailable_locations:
          missingCount,

        details_attempted:
          enrichment.attempted,

        details_succeeded:
          enrichment.succeeded,

        details_failed:
          enrichment.failed,

        /*
          Count of actual SerpApi calls.
        */

        serpapi_request_count:
          1 + enrichment.attempted,

        shopify_request_count: 1
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
