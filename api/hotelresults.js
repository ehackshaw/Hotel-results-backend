
/*
========================================================
BOKKARA HOTEL RESULTS BACKEND
File: api/hotelresults.js

FEATURES:
- One SerpApi Google Hotels request per batch
- Up to 20 properties returned per request
- URL search parameter support
- Improved property address extraction
- Search destination location fallback
- No additional property-details requests
- Hotel images, amenities, ratings and pricing
- Pagination token support when provided by SerpApi
- Compatible with Bokkara Shopify hotel results
========================================================
*/

const SERPAPI_URL = "https://serpapi.com/search.json";

const PAGE_SIZE = 20;

const TIMEOUT = Number(
  process.env.BOKKARA_SEARCH_TIMEOUT_MS || 20000
);


/* ========================================================
   GENERAL HELPERS
======================================================== */

function first(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  ) ?? null;
}


function text(value) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "object"
  ) {
    return "";
  }

  const result = String(value).trim();

  if (
    /^(undefined|null|nan|\[object object\])$/i.test(
      result
    )
  ) {
    return "";
  }

  return result;
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
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "object") {
    return number(
      first(
        value.extracted_lowest,
        value.extracted_price,
        value.amount,
        value.value,
        value.extracted
      )
    );
  }

  const result = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(result) ? result : null;
}


function unique(values) {
  return [
    ...new Set(values.filter(Boolean))
  ];
}


function clamp(value, min, max, fallback) {
  const result = number(value);

  if (result === null) {
    return fallback;
  }

  return Math.max(
    min,
    Math.min(max, Math.trunc(result))
  );
}


function boolean(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true"
  );
}


function validURL(value) {
  const result = text(value);

  return /^https?:\/\//i.test(result)
    ? result
    : "";
}


/* ========================================================
   DATE HANDLING
======================================================== */

function normalizeDate(value) {
  const input = text(value);

  if (!input) return "";

  let year;
  let month;
  let day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    [year, month, day] = input
      .split("-")
      .map(Number);

  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    [day, month, year] = input
      .split("/")
      .map(Number);

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


/* ========================================================
   SEARCH PARAMETERS
======================================================== */

function parseSearch(req) {
  const source = req.method === "POST"
    ? object(req.body)
    : object(req.query);

  const currency = text(
    source.currency
  ).toUpperCase();

  return {
    destination: text(
      first(
        source.destination,
        source.q,
        source.location
      )
    ),

    check_in_date: normalizeDate(
      first(
        source.checkin,
        source.check_in_date,
        source.checkIn
      )
    ),

    check_out_date: normalizeDate(
      first(
        source.checkout,
        source.check_out_date,
        source.checkOut
      )
    ),

    rooms: clamp(
      source.rooms,
      1,
      10,
      1
    ),

    adults: clamp(
      source.adults,
      1,
      40,
      1
    ),

    children: clamp(
      source.children,
      0,
      40,
      0
    ),

    babies: clamp(
      source.babies,
      0,
      40,
      0
    ),

    seniors: clamp(
      source.seniors,
      0,
      40,
      0
    ),

    currency: /^[A-Z]{3}$/.test(currency)
      ? currency
      : "USD",

    limit: clamp(
      source.limit,
      1,
      PAGE_SIZE,
      PAGE_SIZE
    ),

    page_token: text(
      first(
        source.page_token,
        source.next_page_token
      )
    ),

    sort: text(source.sort) || "recommended"
  };
}


/* ========================================================
   SEARCH VALIDATION
======================================================== */

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


/* ========================================================
   ADDRESS CLEANING
======================================================== */

function cleanAddress(value) {
  if (typeof value === "string") {
    return text(
      value.replace(/\s+/g, " ")
    );
  }

  if (Array.isArray(value)) {
    return value
      .map(cleanAddress)
      .filter(Boolean)
      .join(", ");
  }

  const data = object(value);

  const formatted = first(
    data.formatted_address,
    data.formattedAddress,
    data.full_address,
    data.fullAddress,
    data.display_name,
    data.address
  );

  if (typeof formatted === "string") {
    return cleanAddress(formatted);
  }

  const street = first(
    data.street_address,
    data.streetAddress,
    data.street,
    data.address_line1,
    data.addressLine1,
    data.address1,
    data.line1,
    data.route,
    data.road
  );

  const streetNumber = first(
    data.street_number,
    data.streetNumber,
    data.house_number
  );

  const streetLine = [
    streetNumber,
    street
  ]
    .filter(Boolean)
    .map(text)
    .join(" ");

  return [
    streetLine,

    first(
      data.address_line2,
      data.line2
    ),

    first(
      data.city,
      data.locality,
      data.town
    ),

    first(
      data.state,
      data.region
    ),

    first(
      data.postal_code,
      data.postcode,
      data.zip
    ),

    data.country
  ]
    .map(text)
    .filter(Boolean)
    .join(", ");
}


/* ========================================================
   STREET ADDRESS DETECTION
======================================================== */

function looksLikeStreet(value) {
  const address = cleanAddress(value);

  if (!address) {
    return false;
  }

  if (
    /^(property address unavailable|property location unavailable|undefined|null)$/i
      .test(address)
  ) {
    return false;
  }

  const roadPattern =
    /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|parkway|pkwy\.?|square|plaza|calle|rue|paseo|route|quay|promenade|strasse|straße|via|viale|corso|chemin)\b/i;

  const numbered =
    /(?:^|,)\s*\d{1,6}[a-z]?(?:[\s,-]|$)/i;

  return (
    roadPattern.test(address) ||
    numbered.test(address)
  );
}


/* ========================================================
   PROPERTY LOCATION EXTRACTION

   Priority:
   1. Actual street address
   2. Property neighborhood/city/region
   3. Other location label
   4. Search destination fallback

   Never label a destination fallback as a verified
   street address.
======================================================== */

function extractLocation(raw, searchDestination = "") {
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
      const address = cleanAddress(
        source[field]
      );

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

  const neighborhood = text(
    first(
      data.neighborhood,
      data.district,
      data.location?.neighborhood,
      data.location?.district
    )
  );

  const city = text(
    first(
      data.city,
      data.locality,
      data.town,
      data.location?.city,
      data.location?.locality
    )
  );

  const region = text(
    first(
      data.state,
      data.region,
      data.location?.state,
      data.location?.region
    )
  );

  const country = text(
    first(
      data.country,
      data.location?.country
    )
  );

  const area = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  const destination = text(
    searchDestination
  );

  let label = "";
  let locationType = "unavailable";
  let locationSource = "unavailable";

  if (street) {
    label = street;
    locationType = "street";
    locationSource = streetMatch.source;

  } else if (area) {
    label = area;
    locationType = "area";
    locationSource = "property_area";

  } else if (candidates.length) {
    label = candidates[0].address;
    locationType = "area";
    locationSource = candidates[0].source;

  } else if (destination) {
    label = destination;
    locationType = "area";
    locationSource = "search_destination";
  }

  return {
    address: street,

    formatted_address: street,

    address_available: Boolean(street),

    address_source: streetMatch?.source || "",

    location_label: label,

    location_type: locationType,

    location_source: locationSource,

    location_is_fallback:
      locationSource === "search_destination",

    neighborhood,
    city,
    region,
    country
  };
}


/* ========================================================
   HOTEL IMAGES
======================================================== */

function extractPhotos(raw) {
  const hotel = object(raw);

  const sources = [
    hotel.thumbnail,
    hotel.image,
    hotel.image_url,
    hotel.main_image,
    hotel.photo,

    ...array(hotel.images),
    ...array(hotel.photos),
    ...array(hotel.hotel_images),
    ...array(hotel.hotel_photos)
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


/* ========================================================
   HOTEL AMENITIES
======================================================== */

function extractAmenities(raw) {
  const hotel = object(raw);

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
      : Object.values(object(source)).flat();

  return unique(
    values.map(item =>
      typeof item === "string"
        ? text(item)
        : text(
            first(
              item?.name,
              item?.title,
              item?.label
            )
          )
    )
  );
}


/* ========================================================
   HOTEL NORMALIZATION
======================================================== */

function normalizeHotel(raw, index, q) {
  const hotel = object(raw);

  const name = text(
    first(
      hotel.name,
      hotel.hotel_name,
      hotel.property_name,
      hotel.title
    )
  );

  if (!name) {
    return null;
  }

  /*
    FIX:
    Pass the searched destination into the location
    extractor so properties without street addresses
    still have a displayable search-area label.
  */

  const location = extractLocation(
    hotel,
    q.destination
  );

  const images = extractPhotos(hotel);

  const amenities = extractAmenities(hotel);

  const gps = object(
    first(
      hotel.gps_coordinates,
      hotel.coordinates
    )
  );

  const latitude = number(
    first(
      gps.latitude,
      gps.lat,
      hotel.latitude,
      hotel.lat
    )
  );

  const longitude = number(
    first(
      gps.longitude,
      gps.lng,
      gps.long,
      hotel.longitude,
      hotel.long
    )
  );

  const propertyToken = text(
    first(
      hotel.property_token,
      hotel.propertyToken
    )
  );

  const nightlyPrice = number(
    first(
      hotel.rate_per_night?.extracted_lowest,
      hotel.rate_per_night?.extracted_price,
      hotel.extracted_price,
      hotel.price_per_night,
      hotel.price
    )
  );

  const totalPrice = number(
    first(
      hotel.total_rate?.extracted_lowest,
      hotel.total_rate?.extracted_price,
      hotel.total_price
    )
  );

  const stars = number(
    first(
      hotel.extracted_hotel_class,
      hotel.hotel_class,
      hotel.stars
    )
  );

  const rating = number(
    first(
      hotel.overall_rating,
      hotel.rating,
      hotel.guest_rating
    )
  );

  const reviews = number(
    first(
      hotel.reviews,
      hotel.review_count,
      hotel.total_reviews
    )
  );

  return {
    id: text(
      first(
        propertyToken,
        hotel.hotel_id,
        hotel.place_id,
        hotel.id,
        `${name}|${index}`
      )
    ),

    index,

    name,

    type: text(hotel.type) || "hotel",

    description: text(
      first(
        hotel.description,
        hotel.hotel_description
      )
    ),

    property_token: propertyToken,

    hotel_id: text(hotel.hotel_id),

    place_id: text(hotel.place_id),

    /*
      Location fields.
    */

    ...location,

    /*
      Ratings.
    */

    stars,
    hotel_class: stars,

    rating,

    reviews,
    review_count: reviews,

    rating_description: text(
      first(
        hotel.rating_description,
        hotel.rating_text
      )
    ),

    /*
      Pricing.
    */

    price: nightlyPrice,

    extracted_price: nightlyPrice,

    price_per_night: nightlyPrice,

    total_price: totalPrice,

    currency: q.currency,

    /*
      Images.
    */

    images,

    photos: images,

    image: images[0] || "",

    thumbnail: images[0] || "",

    image_count: images.length,

    /*
      Amenities.
    */

    amenities,

    free_cancellation: boolean(
      hotel.free_cancellation
    ),

    free_breakfast: boolean(
      hotel.free_breakfast
    ),

    /*
      Coordinates.
    */

    latitude,
    longitude,

    lat: latitude,
    long: longitude,

    /*
      Other property fields.
    */

    deal: hotel.deal || "",

    deal_description: text(
      hotel.deal_description
    ),

    sponsored: boolean(
      hotel.sponsored
    ),

    eco_certified: boolean(
      hotel.eco_certified
    ),

    serpapi_property_details_link: text(
      hotel.serpapi_property_details_link
    ),

    /*
      No separate details requests.
    */

    details_requested: false,

    details_loaded: false,

    details_error: ""
  };
}


/* ========================================================
   SERPAPI REQUEST
======================================================== */

async function serpapiRequest(params) {
  const url = new URL(SERPAPI_URL);

  for (
    const [key, value] of Object.entries(params)
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

      signal: AbortSignal.timeout(TIMEOUT)
    }
  );

  const data = await response.json();

  if (
    !response.ok ||
    data.error
  ) {
    throw new Error(
      text(data.error) ||
      `SerpApi HTTP ${response.status}`
    );
  }

  return data;
}


/* ========================================================
   GOOGLE HOTELS SEARCH
======================================================== */

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

  /*
    Exactly one SerpApi request.
  */

  return serpapiRequest(params);
}


/* ========================================================
   EXTRACT PROPERTY RESULTS
======================================================== */

function extractProperties(data) {
  return [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties
  ].find(Array.isArray) || [];
}


/* ========================================================
   PAGINATION
======================================================== */

function getNextPageToken(data) {
  return text(
    first(
      data?.serpapi_pagination?.next_page_token,
      data?.pagination?.next_page_token,
      data?.next_page_token
    )
  );
}


/* ========================================================
   HOTEL DEDUPLICATION
======================================================== */

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

    if (!hotel) {
      continue;
    }

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

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    hotels.push(hotel);
  }

  return hotels;
}


/* ========================================================
   HOTEL SORTING
======================================================== */

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

    if (x == null) {
      return 1;
    }

    if (y == null) {
      return -1;
    }

    return descending
      ? y - x
      : x - y;
  }

  switch (sort) {
    case "price-low":
      list.sort(
        (a, b) =>
          compare(
            a,
            b,
            "price",
            false
          )
      );
      break;

    case "price-high":
      list.sort(
        (a, b) =>
          compare(
            a,
            b,
            "price",
            true
          )
      );
      break;

    case "rating":
      list.sort(
        (a, b) =>
          compare(
            a,
            b,
            "rating",
            true
          )
      );
      break;

    case "stars":
      list.sort(
        (a, b) =>
          compare(
            a,
            b,
            "stars",
            true
          )
      );
      break;
  }

  return list;
}


/* ========================================================
   MAIN VERCEL API HANDLER
======================================================== */

export default async function handler(req, res) {
  /*
    CORS.
  */

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

  /*
    Preflight.
  */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /*
    Allowed methods.
  */

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  /*
    SerpApi credentials.
  */

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

  /*
    Search parameters.
  */

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
      One SerpApi search request.
    */

    const searchData = await searchHotels(
      q,
      apiKey
    );

    /*
      Read properties from response.
    */

    const rawProperties = extractProperties(
      searchData
    );

    /*
      Normalize and deduplicate.
    */

    const hotels = deduplicateHotels(
      rawProperties,
      q
    );

    /*
      Sort and limit.
    */

    const selectedHotels = sortHotels(
      hotels,
      q.sort
    ).slice(0, q.limit);

    /*
      Pagination.
    */

    const nextPageToken = getNextPageToken(
      searchData
    );

    const hasMore =
      Boolean(nextPageToken) &&
      nextPageToken !== q.page_token;

    /*
      Location statistics.
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
          hotel.location_type === "unavailable"
      ).length;

    const fallbackCount =
      selectedHotels.filter(
        hotel =>
          hotel.location_source ===
          "search_destination"
      ).length;

    /*
      Return response to Shopify.
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

        returned: selectedHotels.length
      },

      meta: {
        requested_limit: q.limit,

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

        destination_fallbacks:
          fallbackCount,

        address_fields_present:
          selectedHotels.filter(
            hotel =>
              hotel.address ||
              hotel.location_label
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
