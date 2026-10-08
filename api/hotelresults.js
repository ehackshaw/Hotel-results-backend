
/*
========================================================
BOKKARA — HOTEL RESULTS BACKEND
20 PROPERTIES PER REQUEST
TRUE INFINITE SCROLL

FILE: api/hotelresults.js

API BEHAVIOR:
- One Shopify request per batch
- One SerpApi request per batch
- Maximum 20 properties returned
- No additional property-details requests
- No automatic address-enrichment requests
- Supports next-page tokens when provided
- Preserves hotel data for frontend cards

REQUIRED ENVIRONMENT VARIABLE:
SERPAPI_API_KEY

OPTIONAL:
BOKKARA_SEARCH_TIMEOUT_MS
========================================================
*/

const SERPAPI_URL =
  "https://serpapi.com/search.json";

const PAGE_SIZE = 20;

const SEARCH_TIMEOUT = Number(
  process.env.BOKKARA_SEARCH_TIMEOUT_MS || 20000
);


/* =====================================================
   GENERAL HELPERS
===================================================== */

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

  const result = String(value).trim();

  if (
    /^(undefined|null|nan|\[object object\])$/i
      .test(result)
  ) {
    return "";
  }

  return result;
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

  if (typeof value === "object") {
    return num(first(
      value.extracted_lowest,
      value.extracted_price,
      value.amount,
      value.value,
      value.extracted
    ));
  }

  const result = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

function unique(values) {
  return [
    ...new Set(values.filter(Boolean))
  ];
}

function validURL(value) {
  const result = txt(value);

  return /^https?:\/\//i.test(result)
    ? result
    : "";
}

function bool(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true"
  );
}

function clamp(value, min, max, fallback) {
  const result = num(value);

  return result === null
    ? fallback
    : Math.max(
        min,
        Math.min(max, Math.trunc(result))
      );
}


/* =====================================================
   DATE NORMALIZATION
===================================================== */

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


/* =====================================================
   SEARCH PARAMETERS
===================================================== */

function parseSearch(req) {
  const source =
    req.method === "POST"
      ? obj(req.body)
      : obj(req.query);

  const currency =
    txt(source.currency).toUpperCase();

  return {
    destination: txt(first(
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

    rooms: clamp(
      source.rooms, 1, 10, 1
    ),

    adults: clamp(
      source.adults, 1, 40, 1
    ),

    children: clamp(
      source.children, 0, 40, 0
    ),

    babies: clamp(
      source.babies, 0, 40, 0
    ),

    seniors: clamp(
      source.seniors, 0, 40, 0
    ),

    currency:
      /^[A-Z]{3}$/.test(currency)
        ? currency
        : "USD",

    limit: clamp(
      source.limit,
      1,
      PAGE_SIZE,
      PAGE_SIZE
    ),

    page_token: txt(first(
      source.page_token,
      source.next_page_token
    )),

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


/* =====================================================
   PROPERTY ADDRESS EXTRACTION
===================================================== */

function cleanAddress(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return txt(
      value.replace(/\s+/g, " ")
    );
  }

  const data = obj(value);

  const formatted = first(
    data.formatted_address,
    data.formattedAddress,
    data.full_address,
    data.fullAddress
  );

  if (formatted) {
    return cleanAddress(formatted);
  }

  const street = first(
    data.street_address,
    data.streetAddress,
    data.street,
    data.address_line1,
    data.addressLine1,
    data.address1,
    data.line1
  );

  if (street) {
    return unique([
      cleanAddress(street),
      cleanAddress(data.address_line2),
      txt(first(
        data.city,
        data.locality
      )),
      txt(first(
        data.state,
        data.region
      )),
      txt(first(
        data.postal_code,
        data.zip
      )),
      txt(data.country)
    ]).join(", ");
  }

  return cleanAddress(data.address);
}

function looksLikeStreet(value) {
  const address = cleanAddress(value);

  if (!address) return false;

  const streetPattern =
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|parkway|pkwy\.?|square|plaza|calle|rue|paseo)\b/i;

  return (
    streetPattern.test(address) &&
    /\b\d{1,6}[a-z]?\b/i.test(address)
  );
}

function extractLocation(raw) {
  const data = obj(raw);

  const sources = [
    data,
    obj(data.location),
    obj(data.property),
    obj(data.hotel),
    obj(data.details)
  ];

  const addresses = [];

  for (const source of sources) {
    for (const key of [
      "address",
      "formatted_address",
      "full_address",
      "street_address",
      "hotel_address",
      "property_address"
    ]) {
      const address =
        cleanAddress(source[key]);

      if (address) {
        addresses.push({
          address,
          source: key
        });
      }
    }
  }

  const streetMatch = addresses.find(
    item => looksLikeStreet(item.address)
  );

  const street =
    streetMatch?.address || "";

  const neighborhood = txt(first(
    data.neighborhood,
    data.district,
    data.location?.neighborhood
  ));

  const city = txt(first(
    data.city,
    data.locality,
    data.location?.city
  ));

  const region = txt(first(
    data.state,
    data.region,
    data.location?.region
  ));

  const country = txt(first(
    data.country,
    data.location?.country
  ));

  const area = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  const locationLabel =
    street ||
    addresses[0]?.address ||
    area ||
    "";

  return {
    address: street,

    formatted_address: street,

    address_available: Boolean(street),

    address_source:
      streetMatch?.source || "",

    location_label: locationLabel,

    location_type: street
      ? "street"
      : locationLabel
        ? "area"
        : "unavailable",

    neighborhood,
    city,
    region,
    country
  };
}


/* =====================================================
   HOTEL PHOTOS
===================================================== */

function extractPhotos(raw) {
  const hotel = obj(raw);

  const sources = [
    hotel.thumbnail,
    hotel.image,
    hotel.image_url,
    hotel.main_image,
    hotel.photo,

    ...arr(hotel.images),
    ...arr(hotel.photos),
    ...arr(hotel.hotel_images),
    ...arr(hotel.hotel_photos)
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


/* =====================================================
   HOTEL AMENITIES
===================================================== */

function extractAmenities(raw) {
  const hotel = obj(raw);

  const source = first(
    hotel.amenities,
    hotel.hotel_amenities,
    hotel.facilities,
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
        : txt(first(
            item?.name,
            item?.title,
            item?.label
          ))
    )
  );
}


/* =====================================================
   NORMALIZE HOTEL
===================================================== */

function normalizeHotel(raw, index, q) {
  const hotel = obj(raw);

  const name = txt(first(
    hotel.name,
    hotel.hotel_name,
    hotel.property_name,
    hotel.title
  ));

  if (!name) return null;

  const location =
    extractLocation(hotel);

  const images =
    extractPhotos(hotel);

  const amenities =
    extractAmenities(hotel);

  const gps = obj(first(
    hotel.gps_coordinates,
    hotel.coordinates
  ));

  const latitude = num(first(
    gps.latitude,
    gps.lat,
    hotel.latitude,
    hotel.lat
  ));

  const longitude = num(first(
    gps.longitude,
    gps.lng,
    gps.long,
    hotel.longitude,
    hotel.long
  ));

  const propertyToken = txt(first(
    hotel.property_token,
    hotel.propertyToken
  ));

  const nightlyPrice = num(first(
    hotel.rate_per_night?.extracted_lowest,
    hotel.rate_per_night?.extracted_price,
    hotel.extracted_price,
    hotel.price_per_night,
    hotel.price
  ));

  const totalPrice = num(first(
    hotel.total_rate?.extracted_lowest,
    hotel.total_rate?.extracted_price,
    hotel.total_price
  ));

  const stars = num(first(
    hotel.extracted_hotel_class,
    hotel.hotel_class,
    hotel.stars
  ));

  const rating = num(first(
    hotel.overall_rating,
    hotel.rating,
    hotel.guest_rating
  ));

  const reviews = num(first(
    hotel.reviews,
    hotel.review_count,
    hotel.total_reviews
  ));

  return {
    id: txt(first(
      propertyToken,
      hotel.hotel_id,
      hotel.place_id,
      hotel.id,
      `${name}|${index}`
    )),

    index,
    name,

    type:
      txt(hotel.type) || "hotel",

    description: txt(first(
      hotel.description,
      hotel.hotel_description
    )),

    property_token: propertyToken,

    hotel_id:
      txt(hotel.hotel_id),

    place_id:
      txt(hotel.place_id),

    ...location,

    stars,
    hotel_class: stars,

    rating,
    reviews,
    review_count: reviews,

    rating_description: txt(first(
      hotel.rating_description,
      hotel.rating_text
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

    free_cancellation:
      bool(hotel.free_cancellation),

    free_breakfast:
      bool(hotel.free_breakfast),

    latitude,
    longitude,

    lat: latitude,
    long: longitude,

    deal: hotel.deal || "",

    deal_description:
      txt(hotel.deal_description),

    sponsored:
      bool(hotel.sponsored),

    eco_certified:
      bool(hotel.eco_certified),

    serpapi_property_details_link:
      txt(hotel.serpapi_property_details_link),

    details_requested: false,

    details_loaded: false,

    details_error: ""
  };
}


/* =====================================================
   SERPAPI REQUEST
===================================================== */

async function serpapiRequest(params) {
  const url = new URL(SERPAPI_URL);

  for (
    const [key, value]
    of Object.entries(params)
  ) {
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

      signal: AbortSignal.timeout(
        SEARCH_TIMEOUT
      )
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


/* =====================================================
   GOOGLE HOTELS SEARCH

   IMPORTANT:
   EXACTLY ONE SERPAPI REQUEST PER CALL.
===================================================== */

async function searchHotels(q, apiKey) {
  const params = {
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

    gl: "us"
  };

  if (q.page_token) {
    params.next_page_token =
      q.page_token;
  }

  return serpapiRequest(params);
}


/* =====================================================
   EXTRACT PROPERTIES
===================================================== */

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


/* =====================================================
   EXTRACT NEXT PAGE TOKEN
===================================================== */

function getNextPageToken(data) {
  return txt(first(
    data?.serpapi_pagination?.next_page_token,
    data?.pagination?.next_page_token,
    data?.next_page_token
  ));
}


/* =====================================================
   REMOVE DUPLICATES WITHIN BATCH
===================================================== */

function deduplicateHotels(
  rawProperties,
  q
) {
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


/* =====================================================
   HOTEL SORTING
===================================================== */

function sortHotels(hotels, sort) {
  const list = [...hotels];

  function compare(
    a,
    b,
    field,
    descending
  ) {
    const x = a[field];
    const y = b[field];

    if (
      x == null &&
      y == null
    ) {
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
      list.sort(
        (a, b) =>
          compare(a, b, "price", false)
      );
      break;

    case "price-high":
      list.sort(
        (a, b) =>
          compare(a, b, "price", true)
      );
      break;

    case "rating":
      list.sort(
        (a, b) =>
          compare(a, b, "rating", true)
      );
      break;

    case "stars":
      list.sort(
        (a, b) =>
          compare(a, b, "stars", true)
      );
      break;

    default:
      break;
  }

  return list;
}


/* =====================================================
   MAIN VERCEL HANDLER
===================================================== */

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

  if (
    req.method === "OPTIONS"
  ) {
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
    ========================================
    STEP 1:
    REQUEST ONE GOOGLE HOTELS PAGE
    ========================================
    */

    const searchData =
      await searchHotels(
        q,
        apiKey
      );

    /*
    ========================================
    STEP 2:
    EXTRACT HOTEL RESULTS
    ========================================
    */

    const rawProperties =
      extractProperties(searchData);

    /*
    ========================================
    STEP 3:
    NORMALIZE AND DEDUPLICATE
    ========================================
    */

    const hotels =
      deduplicateHotels(
        rawProperties,
        q
      );

    /*
    ========================================
    STEP 4:
    RETURN UP TO 20 PROPERTIES
    ========================================
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
    ========================================
    STEP 5:
    READ PAGINATION TOKEN
    ========================================
    */

    const nextPageToken =
      getNextPageToken(searchData);

    const hasMore =
      Boolean(nextPageToken) &&
      nextPageToken !== q.page_token;

    /*
    ========================================
    STEP 6:
    ADDRESS STATISTICS
    ========================================
    */

    const streetCount =
      selectedHotels.filter(
        hotel =>
          hotel.address_available
      ).length;

    const areaCount =
      selectedHotels.filter(
        hotel =>
          !hotel.address_available &&
          hotel.location_type === "area"
      ).length;

    const missingCount =
      selectedHotels.filter(
        hotel =>
          hotel.location_type ===
          "unavailable"
      ).length;

    /*
    ========================================
    STEP 7:
    RETURN RESPONSE TO SHOPIFY
    ========================================
    */

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

        returned:
          selectedHotels.length
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

        details_attempted: 0,

        details_succeeded: 0,

        details_failed: 0,

        serpapi_request_count: 1,

        shopify_request_count: 1,

        frontend_batch_size:
          PAGE_SIZE
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
