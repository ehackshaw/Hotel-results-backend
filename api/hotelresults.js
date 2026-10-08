
/*
========================================================
BOKKARA — HOTEL RESULTS BACKEND
INFINITE SCROLL + PROPERTY ADDRESS ENRICHMENT

FILE: api/hotelresults.js

FEATURES:
- Google Hotels via SerpApi
- Up to 500 unique properties
- Attempts supported SerpApi pagination
- Property details and address enrichment
- Photos, amenities, ratings and pricing
- Duplicate property removal
- One response to Shopify
- Frontend reveals 20 properties per scroll batch

ENVIRONMENT VARIABLE:
SERPAPI_API_KEY

OPTIONAL:
BOKKARA_MAX_HOTELS
BOKKARA_MAX_SEARCH_PAGES
BOKKARA_MAX_DETAIL_REQUESTS
BOKKARA_DETAIL_CONCURRENCY
BOKKARA_SEARCH_TIMEOUT_MS
BOKKARA_DETAIL_TIMEOUT_MS
========================================================
*/

const SERPAPI_URL =
  "https://serpapi.com/search.json";

const MAX_HOTELS = Math.min(
  500,
  Math.max(
    20,
    Number(process.env.BOKKARA_MAX_HOTELS || 500)
  )
);

const MAX_SEARCH_PAGES = Math.min(
  25,
  Math.max(
    1,
    Number(process.env.BOKKARA_MAX_SEARCH_PAGES || 25)
  )
);

const SEARCH_PAGE_SIZE = 20;

const DETAIL_CONCURRENCY = Math.min(
  20,
  Math.max(
    1,
    Number(process.env.BOKKARA_DETAIL_CONCURRENCY || 10)
  )
);

const MAX_DETAIL_REQUESTS = Math.min(
  MAX_HOTELS,
  Math.max(
    0,
    Number(process.env.BOKKARA_MAX_DETAIL_REQUESTS || 100)
  )
);

const SEARCH_TIMEOUT = Number(
  process.env.BOKKARA_SEARCH_TIMEOUT_MS || 20000
);

const DETAIL_TIMEOUT = Number(
  process.env.BOKKARA_DETAIL_TIMEOUT_MS || 7000
);


/* =====================================================
   HELPERS
===================================================== */

function first(...values) {
  return values.find(
    v => v !== undefined && v !== null && v !== ""
  ) ?? null;
}

function txt(value) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "object"
  ) return "";

  const s = String(value).trim();

  return /^(undefined|null|nan|\[object object\])$/i.test(s)
    ? ""
    : s;
}

function obj(value) {
  return value && typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) return null;

  if (typeof value === "object") {
    return num(first(
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

function safeURL(value) {
  const s = txt(value);

  return /^https?:\/\//i.test(s) ? s : "";
}

function flag(value) {
  return value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true";
}

function clamp(value, min, max, fallback) {
  const n = num(value);

  return n === null
    ? fallback
    : Math.max(min, Math.min(max, Math.trunc(n)));
}


/* =====================================================
   DATES
===================================================== */

function normalizeDate(value) {
  const input = txt(value);
  if (!input) return "";

  let y, m, d;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    [y, m, d] = input.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    [d, m, y] = input.split("/").map(Number);
  } else {
    const date = new Date(input);

    if (!Number.isFinite(date.getTime())) return "";

    y = date.getUTCFullYear();
    m = date.getUTCMonth() + 1;
    d = date.getUTCDate();
  }

  const check = new Date(Date.UTC(y, m - 1, d));

  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) return "";

  return [
    y,
    String(m).padStart(2, "0"),
    String(d).padStart(2, "0")
  ].join("-");
}


/* =====================================================
   SEARCH PARAMETERS
===================================================== */

function parseSearch(req) {
  const p = req.method === "POST"
    ? obj(req.body)
    : obj(req.query);

  const currency = txt(p.currency).toUpperCase();

  return {
    destination: txt(first(
      p.destination, p.q, p.location
    )),

    check_in_date: normalizeDate(first(
      p.checkin, p.check_in_date, p.checkIn
    )),

    check_out_date: normalizeDate(first(
      p.checkout, p.check_out_date, p.checkOut
    )),

    rooms: clamp(p.rooms, 1, 10, 1),
    adults: clamp(p.adults, 1, 40, 1),
    children: clamp(p.children, 0, 40, 0),
    babies: clamp(p.babies, 0, 40, 0),
    seniors: clamp(p.seniors, 0, 40, 0),

    currency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : "USD",

    limit: clamp(
      first(p.limit, p.count),
      1,
      MAX_HOTELS,
      MAX_HOTELS
    ),

    sort: txt(p.sort) || "recommended"
  };
}

function validateSearch(q) {
  if (!q.destination) {
    throw new Error("Destination is required.");
  }

  if (!q.check_in_date || !q.check_out_date) {
    throw new Error("Valid travel dates are required.");
  }

  if (q.check_out_date <= q.check_in_date) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}


/* =====================================================
   ADDRESS EXTRACTION
===================================================== */

function cleanAddress(value) {
  if (typeof value === "string") {
    return txt(value.replace(/\s+/g, " "));
  }

  const o = obj(value);

  const formatted = first(
    o.formatted_address,
    o.formattedAddress,
    o.full_address,
    o.fullAddress
  );

  if (formatted) return cleanAddress(formatted);

  const street = first(
    o.street_address,
    o.streetAddress,
    o.street,
    o.address_line1,
    o.address1,
    o.line1
  );

  if (street) {
    return unique([
      cleanAddress(street),
      txt(o.address_line2),
      txt(first(o.city, o.locality)),
      txt(first(o.state, o.region)),
      txt(first(o.postal_code, o.zip)),
      txt(o.country)
    ]).join(", ");
  }

  return txt(o.address);
}

function isStreetAddress(value) {
  const s = cleanAddress(value);

  if (!s) return false;

  const streetType =
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|parkway|pkwy\.?|plaza|calle|rue|paseo|square|circle|trail)\b/i;

  return streetType.test(s) &&
    /\b\d{1,6}[a-z]?\b/i.test(s);
}

function extractLocation(data) {
  const d = obj(data);

  const nested = [
    d,
    obj(d.property),
    obj(d.details),
    obj(d.location),
    obj(d.hotel),
    obj(d.hotel_details),
    obj(d.property_details)
  ];

  const candidates = [];

  for (const item of nested) {
    for (const field of [
      "address",
      "formatted_address",
      "full_address",
      "street_address",
      "hotel_address",
      "property_address"
    ]) {
      if (item[field]) {
        candidates.push({
          field,
          value: cleanAddress(item[field])
        });
      }
    }
  }

  const match = candidates.find(
    c => isStreetAddress(c.value)
  );

  const street = match?.value || "";

  const neighborhood = txt(first(
    d.neighborhood,
    d.district,
    d.location?.neighborhood
  ));

  const city = txt(first(
    d.city,
    d.locality,
    d.location?.city
  ));

  const region = txt(first(
    d.region,
    d.state,
    d.location?.region
  ));

  const country = txt(first(
    d.country,
    d.location?.country
  ));

  const area = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  const label =
    street ||
    candidates[0]?.value ||
    area ||
    "";

  return {
    address: street,
    formatted_address: street,
    address_available: Boolean(street),
    address_source: match?.field || "",

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


/* =====================================================
   IMAGES
===================================================== */

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
      const value = typeof item === "string"
        ? item
        : first(
            item?.original_image,
            item?.image,
            item?.url,
            item?.src,
            item?.thumbnail,
            item?.large
          );

      return safeURL(value);
    })
  );
}


/* =====================================================
   AMENITIES
===================================================== */

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
        : txt(first(
            item?.name,
            item?.title,
            item?.label
          ))
    )
  );
}


/* =====================================================
   HOTEL NORMALIZATION
===================================================== */

function normalizeHotel(raw, index, q) {
  const h = obj(raw);

  const name = txt(first(
    h.name,
    h.hotel_name,
    h.property_name,
    h.title
  ));

  if (!name) return null;

  const location = extractLocation(h);
  const images = extractPhotos(h);
  const amenities = extractAmenities(h);

  const gps = obj(first(
    h.gps_coordinates,
    h.coordinates
  ));

  const lat = num(first(
    gps.latitude,
    gps.lat,
    h.latitude,
    h.lat
  ));

  const long = num(first(
    gps.longitude,
    gps.lng,
    gps.long,
    h.longitude,
    h.long
  ));

  const propertyToken = txt(first(
    h.property_token,
    h.propertyToken
  ));

  const nightly = num(first(
    h.rate_per_night?.extracted_lowest,
    h.rate_per_night?.extracted_price,
    h.extracted_price,
    h.price_per_night,
    h.price
  ));

  const total = num(first(
    h.total_rate?.extracted_lowest,
    h.total_rate?.extracted_price,
    h.total_price
  ));

  const stars = num(first(
    h.extracted_hotel_class,
    h.hotel_class,
    h.stars
  ));

  const rating = num(first(
    h.overall_rating,
    h.rating,
    h.guest_rating
  ));

  const reviews = num(first(
    h.reviews,
    h.review_count,
    h.total_reviews
  ));

  return {
    id: txt(first(
      propertyToken,
      h.hotel_id,
      h.place_id,
      h.id,
      `${name}|${index}`
    )),

    index,
    name,

    type: txt(h.type) || "hotel",

    description: txt(first(
      h.description,
      h.hotel_description
    )),

    property_token: propertyToken,
    hotel_id: txt(h.hotel_id),
    place_id: txt(h.place_id),

    ...location,

    stars,
    hotel_class: stars,

    rating,
    reviews,
    review_count: reviews,

    rating_description: txt(first(
      h.rating_description,
      h.rating_text
    )),

    price: nightly,
    extracted_price: nightly,
    price_per_night: nightly,
    total_price: total,

    currency: q.currency,

    images,
    photos: images,
    image: images[0] || "",
    thumbnail: images[0] || "",
    image_count: images.length,

    amenities,

    free_cancellation: flag(h.free_cancellation),
    free_breakfast: flag(h.free_breakfast),

    latitude: lat,
    longitude: long,
    lat,
    long,

    deal: h.deal || "",
    deal_description: txt(h.deal_description),

    sponsored: flag(h.sponsored),
    eco_certified: flag(h.eco_certified),

    serpapi_property_details_link: txt(
      h.serpapi_property_details_link
    ),

    details_requested: false,
    details_loaded: false,
    details_error: ""
  };
}


/* =====================================================
   SERPAPI REQUEST
===================================================== */

async function serpapiRequest(
  params,
  timeout = SEARCH_TIMEOUT
) {
  const url = new URL(SERPAPI_URL);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== null &&
      value !== undefined &&
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
    signal: AbortSignal.timeout(timeout)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      txt(data.error) ||
      `SerpApi HTTP ${response.status}`
    );
  }

  return data;
}


/* =====================================================
   GOOGLE HOTELS SEARCH
===================================================== */

function baseSearchParams(q, apiKey) {
  return {
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
}

function extractProperties(data) {
  const candidates = [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties
  ];

  return candidates.find(Array.isArray) || [];
}


/* =====================================================
   SEARCH PAGINATION
===================================================== */

/*
The backend follows explicit pagination URLs or tokens
when the provider supplies them.

Google Hotels does not guarantee offset-based pagination.

We do not fabricate offsets or pretend additional
properties exist when no valid next page is supplied.
*/

function getNextPage(data) {
  const pagination = obj(data?.serpapi_pagination);

  const nextURL = safeURL(first(
    pagination.next,
    pagination.next_link,
    data?.pagination?.next,
    data?.pagination?.next_url
  ));

  if (nextURL) {
    return {
      type: "url",
      value: nextURL
    };
  }

  const token = txt(first(
    pagination.next_page_token,
    data?.pagination?.next_page_token
  ));

  if (token) {
    return {
      type: "token",
      value: token
    };
  }

  return null;
}

async function requestNextPage(
  nextPage,
  q,
  apiKey
) {
  if (nextPage.type === "token") {
    return serpapiRequest({
      ...baseSearchParams(q, apiKey),
      next_page_token: nextPage.value
    });
  }

  const url = new URL(nextPage.value);

  /*
    Only allow the official SerpApi search endpoint.
    Never fetch an arbitrary provider-supplied URL.
  */

  if (
    url.protocol !== "https:" ||
    url.hostname !== "serpapi.com" ||
    url.pathname !== "/search.json"
  ) {
    throw new Error(
      "Unsupported pagination URL."
    );
  }

  const params = Object.fromEntries(
    url.searchParams.entries()
  );

  params.api_key = apiKey;

  return serpapiRequest(params);
}


/* =====================================================
   COLLECT ALL AVAILABLE SEARCH PAGES
===================================================== */

async function collectHotels(q, apiKey) {
  const hotels = [];
  const seen = new Set();
  const visitedPages = new Set();

  let pageCount = 0;
  let rawCount = 0;

  let data = await serpapiRequest(
    baseSearchParams(q, apiKey)
  );

  let nextPage = null;
  let stoppedReason = "provider_exhausted";

  while (data && pageCount < MAX_SEARCH_PAGES) {
    pageCount++;

    const properties = extractProperties(data);
    rawCount += properties.length;

    for (const raw of properties) {
      const hotel = normalizeHotel(
        raw,
        rawCount + hotels.length,
        q
      );

      if (!hotel) continue;

      const key = String(
        first(
          hotel.property_token,
          hotel.hotel_id,
          hotel.place_id,
          [
            hotel.name.toLowerCase(),
            hotel.latitude ?? "",
            hotel.longitude ?? ""
          ].join("|")
        )
      ).toLowerCase();

      if (seen.has(key)) continue;

      seen.add(key);
      hotels.push(hotel);

      if (hotels.length >= q.limit) {
        stoppedReason = "requested_limit";
        break;
      }
    }

    nextPage = getNextPage(data);

    if (hotels.length >= q.limit) {
      break;
    }

    if (!nextPage) {
      stoppedReason = "provider_exhausted";
      break;
    }

    const pageKey =
      nextPage.type + ":" + nextPage.value;

    if (visitedPages.has(pageKey)) {
      stoppedReason = "duplicate_page";
      break;
    }

    visitedPages.add(pageKey);

    if (pageCount >= MAX_SEARCH_PAGES) {
      stoppedReason = "page_limit";
      break;
    }

    try {
      data = await requestNextPage(
        nextPage,
        q,
        apiKey
      );
    } catch (error) {
      stoppedReason = "pagination_error";

      console.warn(
        "Bokkara pagination:",
        error.message
      );

      break;
    }
  }

  return {
    hotels,
    rawCount,
    pageCount,
    stoppedReason,

    hasMore:
      stoppedReason === "requested_limit" ||
      stoppedReason === "page_limit"
  };
}


/* =====================================================
   PROPERTY DETAILS
===================================================== */

async function fetchPropertyDetails(
  hotel,
  q,
  apiKey
) {
  if (!hotel.property_token) return null;

  return serpapiRequest(
    {
      ...baseSearchParams(q, apiKey),
      property_token: hotel.property_token
    },
    DETAIL_TIMEOUT
  );
}


/* =====================================================
   MERGE PROPERTY DETAILS
===================================================== */

function mergePropertyDetails(hotel, response) {
  const candidates = [
    obj(response),
    obj(response?.property),
    obj(response?.hotel),
    obj(response?.hotel_details),
    obj(response?.property_details),
    obj(response?.details),
    obj(response?.data)
  ];

  for (const details of candidates) {
    const location = extractLocation(details);

    if (
      location.address_available &&
      !hotel.address_available
    ) {
      hotel.address = location.address;
      hotel.formatted_address =
        location.formatted_address;

      hotel.address_available = true;
      hotel.address_source =
        "property_details." +
        location.address_source;

      hotel.location_label = location.address;
      hotel.location_type = "street";
    }

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
      if (!hotel[field] && location[field]) {
        hotel[field] = location[field];
      }
    }

    const images = extractPhotos(details);

    hotel.images = unique([
      ...hotel.images,
      ...images
    ]);

    hotel.photos = hotel.images;
    hotel.image = hotel.images[0] || "";
    hotel.thumbnail = hotel.images[0] || "";
    hotel.image_count = hotel.images.length;

    hotel.amenities = unique([
      ...hotel.amenities,
      ...extractAmenities(details)
    ]);

    if (!hotel.description) {
      hotel.description = txt(first(
        details.description,
        details.hotel_description
      ));
    }
  }

  hotel.details_loaded = true;
  return hotel;
}


/* =====================================================
   ADDRESS ENRICHMENT WORKERS
===================================================== */

async function enrichHotels(
  hotels,
  q,
  apiKey
) {
  const eligible = hotels
    .filter(
      h =>
        h.property_token &&
        !h.address_available
    )
    .slice(0, MAX_DETAIL_REQUESTS);

  let cursor = 0;
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (cursor < eligible.length) {
      const hotel = eligible[cursor++];

      hotel.details_requested = true;
      attempted++;

      try {
        const data = await fetchPropertyDetails(
          hotel,
          q,
          apiKey
        );

        if (data) {
          mergePropertyDetails(hotel, data);
          succeeded++;
        }
      } catch (error) {
        failed++;

        hotel.details_error =
          error.message || "Details failed";

        console.warn(
          "Bokkara hotel details:",
          hotel.name,
          hotel.details_error
        );
      }
    }
  }

  const workers = Math.min(
    DETAIL_CONCURRENCY,
    eligible.length
  );

  await Promise.all(
    Array.from(
      { length: workers },
      () => worker()
    )
  );

  return {
    attempted,
    succeeded,
    failed
  };
}


/* =====================================================
   SORTING
===================================================== */

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
      list.sort((a,b) =>
        compare(a,b,"price",false)
      );
      break;

    case "price-high":
      list.sort((a,b) =>
        compare(a,b,"price",true)
      );
      break;

    case "rating":
      list.sort((a,b) =>
        compare(a,b,"rating",true)
      );
      break;

    case "stars":
      list.sort((a,b) =>
        compare(a,b,"stars",true)
      );
      break;
  }

  return list;
}


/* =====================================================
   MAIN VERCEL HANDLER
===================================================== */

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

  if (!["GET", "POST"].includes(req.method)) {
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
    /*
      STEP 1:
      Collect available Google Hotels pages.
    */

    const collected = await collectHotels(
      q,
      apiKey
    );

    /*
      STEP 2:
      Sort results.
    */

    const hotels = sortHotels(
      collected.hotels,
      q.sort
    ).slice(0, q.limit);

    /*
      STEP 3:
      Enrich hotel addresses and details.
    */

    const enrichment = await enrichHotels(
      hotels,
      q,
      apiKey
    );

    /*
      STEP 4:
      Calculate metadata.
    */

    const streetCount = hotels.filter(
      h => h.address_available
    ).length;

    const areaCount = hotels.filter(
      h =>
        !h.address_available &&
        h.location_type === "area"
    ).length;

    const missingCount = hotels.filter(
      h => h.location_type === "unavailable"
    ).length;

    /*
      STEP 5:
      Return all collected hotels to Shopify.

      The frontend's IntersectionObserver
      progressively renders these hotels
      in groups of 20.
    */

    return res.status(200).json({
      success: true,

      hotels,
      properties: hotels,
      results: hotels,

      search: q,

      pagination: {
        has_more: collected.hasMore,

        /*
          This response contains the collected
          properties. A continuation token is
          not exposed as a frontend paging API.
        */

        next_page_token: null,

        page_size: SEARCH_PAGE_SIZE,

        returned: hotels.length,

        total_loaded: hotels.length
      },

      meta: {
        requested_limit: q.limit,

        returned_properties: hotels.length,

        unique_properties:
          collected.hotels.length,

        raw_properties:
          collected.rawCount,

        search_pages:
          collected.pageCount,

        pagination_stopped_reason:
          collected.stoppedReason,

        street_addresses: streetCount,

        area_locations: areaCount,

        unavailable_locations: missingCount,

        details_attempted:
          enrichment.attempted,

        details_succeeded:
          enrichment.succeeded,

        details_failed:
          enrichment.failed,

        serpapi_request_count:
          collected.pageCount +
          enrichment.attempted,

        shopify_request_count: 1,

        frontend_batch_size: SEARCH_PAGE_SIZE
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
